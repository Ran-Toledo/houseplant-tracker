import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { ChatEvent, ChatMessage, Conversation } from '@houseplant/shared';
import { AppRoutes } from '../App';
import { ToastProvider } from '../components/Toast';
import { makePlant, mockApi, species, sseResponse } from '../test/mockApi';

const PLANT_ID = '11111111-1111-4111-8111-111111111111';
const CHAT_ID = '66666666-6666-4666-8666-666666666666';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const config = (available: boolean) => ({
  config: {
    ai: { configured: true, enabled: available, available, model: 'gpt-test', usedThisMonth: 1, monthlyLimit: 300 },
    push: { available: false, vapidPublicKey: null, appUrl: null },
    timezone: 'Asia/Jerusalem',
  },
});

const conversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: CHAT_ID,
  plantId: PLANT_ID,
  plant: { id: PLANT_ID, nickname: 'Monty', coverPhoto: null },
  title: 'Why are the leaves yellow?',
  createdAt: '2026-10-19T09:00:00.000Z',
  updatedAt: '2026-10-19T09:00:00.000Z',
  ...overrides,
});

const message = (role: ChatMessage['role'], content: string, id = `${role}-1`): ChatMessage => ({
  id,
  conversationId: CHAT_ID,
  role,
  content,
  photo: null,
  createdAt: '2026-10-19T09:00:00.000Z',
});

/** The events of a normal answer: the stored question, a tool status, the text in pieces, the stored answer. */
const answerEvents = (question: string, answer: string): ChatEvent[] => [
  { type: 'message', message: message('user', question, 'u-new') },
  { type: 'status', tool: 'get_care_signals' },
  { type: 'delta', text: answer.slice(0, 10) },
  { type: 'delta', text: answer.slice(10) },
  { type: 'done', message: message('assistant', answer, 'a-new') },
];

describe('assistant tab', () => {
  it('appears in the navigation only when AI is available or there are conversations', async () => {
    mockApi({
      'GET /api/config': () => config(false),
      'GET /api/conversations': () => ({ conversations: [] }),
      'GET /api/species': () => ({ species }),
    });
    const view = renderAt('/species');
    await screen.findByRole('link', { name: 'Species' });
    await waitFor(() => expect(within(view.getByRole('navigation')).queryByText('Assistant')).toBeNull());
    view.unmount();

    mockApi({ 'GET /api/config': () => config(true), 'GET /api/species': () => ({ species }) });
    renderAt('/species');
    expect(await within(screen.getByRole('navigation')).findByText('Assistant')).toBeTruthy();
  });

  it('lists conversations, newest first, with their plant', async () => {
    mockApi({
      'GET /api/config': () => config(true),
      'GET /api/conversations': () => ({ conversations: [conversation(), conversation({ id: 'g', plantId: null, plant: null, title: 'Safe for cats?' })] }),
    });
    renderAt('/assistant');
    expect(await screen.findByText('Why are the leaves yellow?')).toBeTruthy();
    expect(screen.getByText('Monty')).toBeTruthy();
    expect(screen.getByText('Safe for cats?')).toBeTruthy();
    expect(screen.getByText('All plants ·')).toBeTruthy();
  });

  it('starts a general chat from a starter question and sends it', async () => {
    const sent: unknown[] = [];
    const general = conversation({ plantId: null, plant: null, title: null });
    mockApi({
      'GET /api/config': () => config(true),
      'GET /api/conversations': () => ({ conversations: [] }),
      'POST /api/conversations': () => ({ conversation: general }),
      [`GET /api/conversations/${CHAT_ID}`]: () => ({ conversation: general }),
      [`GET /api/conversations/${CHAT_ID}/messages`]: () => ({ messages: [] }),
      [`POST /api/conversations/${CHAT_ID}/messages`]: (_url, init) => {
        sent.push(JSON.parse(String(init.body)));
        return sseResponse(answerEvents('Which of my plants are safe for cats?', 'None of them are **fully** safe.'));
      },
    });
    renderAt('/assistant');
    fireEvent.click(await screen.findByRole('button', { name: 'Which of my plants are safe for cats?' }));

    // Creating the chat, loading its page and sending the question take several requests.
    expect(await screen.findByText('fully', { selector: 'strong' }, { timeout: 10000 })).toBeTruthy();
    expect(sent).toEqual([{ text: 'Which of my plants are safe for cats?', photoId: null, lang: 'en' }]);
    expect(screen.getByText('Which of my plants are safe for cats?', { selector: 'p' })).toBeTruthy();
  }, 15000);
});

describe('chat', () => {
  const routes = (post: (url: URL, init: RequestInit) => unknown, messages: ChatMessage[] = []) => ({
    'GET /api/config': () => config(true),
    [`GET /api/conversations/${CHAT_ID}`]: () => ({ conversation: conversation() }),
    [`GET /api/conversations/${CHAT_ID}/messages`]: () => ({ messages }),
    [`POST /api/conversations/${CHAT_ID}/messages`]: post,
  });

  it('shows past messages, then streams a new answer rendered as safe Markdown', async () => {
    mockApi(
      routes(
        () =>
          sseResponse(
            answerEvents('Is it getting enough light?', 'Probably not:\n\n- Move it **closer** to the window\n\n<img src="x" onerror="alert(1)">'),
          ),
        [message('user', 'Hi'), message('assistant', 'Hello! Ask me about **Monty**.')],
      ),
    );
    const view = renderAt(`/assistant/${CHAT_ID}`);
    expect(await screen.findByText('Monty', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('About Monty')).toBeTruthy();
    // Starters only show in an empty conversation.
    expect(screen.queryByRole('button', { name: 'What should I do this week?' })).toBeNull();

    const box = await screen.findByLabelText('Ask about Monty…');
    fireEvent.change(box, { target: { value: 'Is it getting enough light?' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(await screen.findByText('closer', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('Move it', { exact: false, selector: 'li' })).toBeTruthy();
    expect(view.container.querySelector('img[src="x"]')).toBeNull();
    expect((box as HTMLTextAreaElement).value).toBe('');
  });

  it('offers starter questions in a new plant conversation', async () => {
    const sent: { text: string }[] = [];
    mockApi(
      routes((_url, init) => {
        sent.push(JSON.parse(String(init.body)));
        return sseResponse(answerEvents('What should I do this week?', 'Check the soil on Friday.'));
      }),
    );
    renderAt(`/assistant/${CHAT_ID}`);
    fireEvent.click(await screen.findByRole('button', { name: 'What should I do this week?' }));
    expect(await screen.findByText('Check the soil on Friday.')).toBeTruthy();
    expect(sent[0]?.text).toBe('What should I do this week?');
  });

  it('explains when an answer fails part-way, keeping the question', async () => {
    mockApi(
      routes(() =>
        sseResponse([
          { type: 'message', message: message('user', 'Hello?', 'u-new') },
          { type: 'error', error: { code: 'ai_timeout', message: 'timeout' } },
        ]),
      ),
    );
    renderAt(`/assistant/${CHAT_ID}`);
    const box = await screen.findByLabelText('Ask about Monty…');
    fireEvent.change(box, { target: { value: 'Hello?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText("The answer couldn't be finished: The AI service took too long to answer. Please try again.")).toBeTruthy();
    expect(screen.getByText('Hello?')).toBeTruthy();
  });

  it('keeps the draft when the message is refused before streaming', async () => {
    mockApi(routes(() => new Response(JSON.stringify({ error: { code: 'ai_limit_reached', message: 'limit' } }), { status: 429 })));
    renderAt(`/assistant/${CHAT_ID}`);
    const box = await screen.findByLabelText('Ask about Monty…');
    fireEvent.change(box, { target: { value: 'One more?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText("This month's AI request limit has been reached. You can raise it in Settings.")).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe('One more?');
  });

  it('shows past conversations read-only when AI is off', async () => {
    mockApi({ ...routes(() => undefined, [message('user', 'Hi')]), 'GET /api/config': () => config(false) });
    renderAt(`/assistant/${CHAT_ID}`);
    expect(await screen.findByText("AI features are off or not set up, so you can't send messages. Past conversations stay here.")).toBeTruthy();
    expect(screen.queryByLabelText('Ask about Monty…')).toBeNull();
  });
});

describe('ask about this plant', () => {
  it('opens a new conversation about the plant from its page', async () => {
    const created: unknown[] = [];
    mockApi({
      'GET /api/config': () => config(true),
      [`GET /api/plants/${PLANT_ID}`]: () => ({ plant: makePlant({ speciesId: null }) }),
      [`GET /api/plants/${PLANT_ID}/activities`]: () => ({ activities: [] }),
      [`GET /api/plants/${PLANT_ID}/photos`]: () => ({ photos: [] }),
      [`GET /api/plants/${PLANT_ID}/schedules`]: () => ({ schedules: [] }),
      [`GET /api/plants/${PLANT_ID}/health-checks`]: () => ({ healthChecks: [] }),
      'GET /api/species': () => ({ species }),
      'GET /api/due': () => ({ items: [] }),
      'GET /api/conversations': (url) => {
        expect(url.searchParams.get('plantId')).toBe(PLANT_ID);
        return { conversations: [] };
      },
      'POST /api/conversations': (_url, init) => {
        created.push(JSON.parse(String(init.body)));
        return { conversation: conversation({ title: null }) };
      },
      [`GET /api/conversations/${CHAT_ID}`]: () => ({ conversation: conversation({ title: null }) }),
      [`GET /api/conversations/${CHAT_ID}/messages`]: () => ({ messages: [] }),
    });
    renderAt(`/plants/${PLANT_ID}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask about this plant' }));
    // Several requests in a row: the plant page, the plant's conversations, the new one, then the chat page.
    expect(await screen.findByRole('button', { name: 'When should I repot?' }, { timeout: 10000 })).toBeTruthy();
    expect(created).toEqual([{ plantId: PLANT_ID }]);
  }, 15000);
});
