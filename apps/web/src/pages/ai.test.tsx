import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { HealthCheck, Identification, Photo } from '@houseplant/shared';
import { AppRoutes } from '../App';
import { ToastProvider } from '../components/Toast';
import { makePlant, mockApi, species } from '../test/mockApi';

const PLANT_ID = '11111111-1111-4111-8111-111111111111';
const PHOTO_ID = '44444444-4444-4444-8444-444444444444';

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

const both = (text: string) => ({ en: text, he: `${text} (he)` });

const identification: Identification = {
  notAPlant: false,
  candidates: [
    { scientificName: 'Monstera deliciosa', commonName: both('Monstera'), catalogSpeciesId: 'monstera-deliciosa', confidence: 'high', reason: both('Split leaves') },
    { scientificName: 'Rhaphidophora tetrasperma', commonName: both('Mini monstera'), catalogSpeciesId: null, confidence: 'low', reason: both('Smaller leaves') },
  ],
};

const photo: Photo = {
  id: PHOTO_ID,
  plantId: PLANT_ID,
  url: `/api/photos/${PHOTO_ID}/file`,
  thumbnailUrl: `/api/photos/${PHOTO_ID}/thumb`,
  isCover: true,
  capturedAt: null,
  createdAt: '2026-10-18T10:00:00.000Z',
};

const check: HealthCheck = {
  id: '55555555-5555-4555-8555-555555555555',
  plantId: PLANT_ID,
  photo,
  condition: 'needs-attention',
  confidence: 'medium',
  assessment: {
    condition: 'needs-attention',
    confidence: 'medium',
    summary: both('Lower leaves are yellowing'),
    findings: [{ key: 'overwatering', observation: both('The soil looks wet'), likelihood: 'likely', actions: [both('Water less often')] }],
    photoQualityIssue: 'too-dark',
  },
  appliedAt: null,
  createdAt: '2026-10-19T09:00:00.000Z',
};

const fileInputs = (container: HTMLElement) => [...container.querySelectorAll<HTMLInputElement>('input[type=file]')];

describe('identify from photo', () => {
  it('is hidden when AI features are unavailable', async () => {
    mockApi({ 'GET /api/species': () => ({ species }), 'GET /api/config': () => config(false) });
    renderAt('/plants/new');
    await screen.findByRole('button', { name: 'Save' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Identify from photo' })).toBeNull());
  });

  it('identifies the chosen photo and fills the species from a catalog match', async () => {
    const posts: { url: string; body: unknown }[] = [];
    const created = makePlant({ id: '22222222-2222-4222-8222-222222222222' });
    mockApi({
      'GET /api/species': () => ({ species }),
      'GET /api/config': () => config(true),
      'POST /api/ai/identify': (url, init) => {
        posts.push({ url: url.pathname, body: init.body });
        return { identification, requestId: 'r1' };
      },
      'POST /api/plants': (url, init) => {
        posts.push({ url: url.pathname, body: JSON.parse(String(init.body)) });
        return { plant: created };
      },
      'PUT /api/plants/22222222-2222-4222-8222-222222222222/schedules/watering': () => ({ schedule: {} }),
      'POST /api/plants/22222222-2222-4222-8222-222222222222/photos': () => ({ photo }),
      'GET /api/plants/22222222-2222-4222-8222-222222222222': () => ({ plant: created }),
    });
    const view = renderAt('/plants/new');
    const identify = await screen.findByRole('button', { name: 'Identify from photo' });
    expect(screen.getByText("Asks for a photo. It isn't saved.")).toBeTruthy();

    // Choose the plant's photo in the form; the identify button then uses it.
    const file = new File(['fake'], 'plant.jpg', { type: 'image/jpeg' });
    const formPhotoInput = fileInputs(view.container).find((i) => !i.hasAttribute('aria-hidden'))!;
    fireEvent.change(formPhotoInput, { target: { files: [file] } });
    expect(await screen.findByText('Uses the photo chosen below.')).toBeTruthy();
    fireEvent.click(identify);

    const matches = await screen.findByRole('region', { name: 'Possible matches' });
    expect(posts[0]?.body).toBeInstanceOf(FormData);
    expect((posts[0]!.body as FormData).get('photo')).toBe(file);
    expect(within(matches).getByText('High confidence')).toBeTruthy();
    expect(within(matches).getByText('Not in the catalog')).toBeTruthy();
    expect(within(matches).getByText('Split leaves')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Nickname/), { target: { value: 'Monty' } });
    fireEvent.click(within(matches).getByRole('button', { name: 'Use this species' }));
    expect(await screen.findByText('Species filled in. Save the form to keep it.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posts.find((p) => p.url === '/api/plants')?.body).toMatchObject({ speciesId: 'monstera-deliciosa' }));
  });

  it('fills a custom species name for a match outside the catalog', async () => {
    mockApi({
      'GET /api/species': () => ({ species }),
      'GET /api/config': () => config(true),
      'POST /api/ai/identify': () => ({ identification, requestId: 'r1' }),
    });
    const view = renderAt('/plants/new');
    await screen.findByRole('button', { name: 'Identify from photo' });
    // With no photo chosen, the button asks for one through its own file input.
    const ownInput = fileInputs(view.container).find((i) => i.hasAttribute('aria-hidden'))!;
    fireEvent.change(ownInput, { target: { files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Use this name' }));
    expect(((await screen.findByLabelText(/Species name/)) as HTMLInputElement).value).toBe('Mini monstera (Rhaphidophora tetrasperma)');
    // The identified photo becomes the plant's photo.
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeTruthy();
    expect(screen.getByText('Uses the photo chosen below.')).toBeTruthy();
  });

  it('shows a readable error when the AI request fails', async () => {
    mockApi({ 'GET /api/species': () => ({ species }), 'GET /api/config': () => config(true) });
    const view = renderAt('/plants/new');
    await screen.findByRole('button', { name: 'Identify from photo' });
    const ownInput = fileInputs(view.container).find((i) => i.hasAttribute('aria-hidden'))!;
    fireEvent.change(ownInput, { target: { files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] } });
    // The mock answers unknown routes with not_found.
    expect(await screen.findByText('This item no longer exists.')).toBeTruthy();
  });
});

describe('health checks', () => {
  const plantRoutes = (overrides: Record<string, (url: URL, init: RequestInit) => unknown> = {}) => ({
    [`GET /api/plants/${PLANT_ID}`]: () => ({ plant: makePlant({ speciesId: null, condition: 'healthy', coverPhoto: photo }) }),
    [`GET /api/plants/${PLANT_ID}/activities`]: () => ({ activities: [] }),
    [`GET /api/plants/${PLANT_ID}/photos`]: () => ({ photos: [photo] }),
    [`GET /api/plants/${PLANT_ID}/schedules`]: () => ({ schedules: [] }),
    'GET /api/species': () => ({ species }),
    'GET /api/due': () => ({ items: [] }),
    ...overrides,
  });

  it('checks the cover photo, shows the result and applies the condition only when asked', async () => {
    const calls: { key: string; body: unknown }[] = [];
    const record = (key: string, result: unknown) => (_url: URL, init: RequestInit) => {
      calls.push({ key, body: init.body ? JSON.parse(String(init.body)) : undefined });
      return result;
    };
    mockApi(
      plantRoutes({
        'GET /api/config': () => config(true),
        [`GET /api/plants/${PLANT_ID}/health-checks`]: () => ({ healthChecks: [] }),
        [`POST /api/plants/${PLANT_ID}/health-checks`]: record('create', { healthCheck: check }),
        [`POST /api/health-checks/${check.id}/apply`]: record('apply', {
          healthCheck: { ...check, appliedAt: '2026-10-19T09:01:00.000Z' },
          plant: makePlant({ speciesId: null, condition: 'needs-attention', coverPhoto: photo }),
        }),
        [`POST /api/plants/${PLANT_ID}/activities`]: record('activity', { activity: {} }),
      }),
    );
    renderAt(`/plants/${PLANT_ID}`);

    expect(await screen.findByText('No health checks yet. A check looks at the cover photo and suggests what to do.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check health' }));
    expect(await screen.findByText('Lower leaves are yellowing')).toBeTruthy();
    expect(calls[0]).toEqual({ key: 'create', body: { photoId: PHOTO_ID } });
    expect(screen.getByText('The soil looks wet')).toBeTruthy();
    expect(screen.getByText('Water less often')).toBeTruthy();
    expect(screen.getByText('The photo is dark, so the result may be less reliable.')).toBeTruthy();
    expect(screen.getByText('AI assessment, not a diagnosis. Check the plant yourself before acting on it.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Log as treatment' }));
    await waitFor(() => expect(calls.find((c) => c.key === 'activity')?.body).toMatchObject({ activityType: 'treatment' }));
    expect((calls.find((c) => c.key === 'activity')!.body as { notes: string }).notes).toBe(
      'From an AI health check: Overwatering. The soil looks wet',
    );

    expect(calls.some((c) => c.key === 'apply')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Set condition to "Needs attention"' }));
    await waitFor(() => expect(calls.some((c) => c.key === 'apply')).toBe(true));
    expect(await screen.findAllByText('Needs attention')).toBeTruthy();
  });

  it('keeps past checks visible when AI is off, without the Check health button', async () => {
    mockApi(
      plantRoutes({
        'GET /api/config': () => config(false),
        [`GET /api/plants/${PLANT_ID}/health-checks`]: () => ({ healthChecks: [check] }),
      }),
    );
    renderAt(`/plants/${PLANT_ID}`);
    expect(await screen.findByText('Lower leaves are yellowing')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check health' })).toBeNull();

    // Rows open into the full result.
    fireEvent.click(screen.getByRole('button', { name: 'Show the full result' }));
    expect(await screen.findByText('The soil looks wet')).toBeTruthy();
  });

  it('hides the section when AI is off and there are no checks', async () => {
    mockApi(
      plantRoutes({
        'GET /api/config': () => config(false),
        [`GET /api/plants/${PLANT_ID}/health-checks`]: () => ({ healthChecks: [] }),
      }),
    );
    renderAt(`/plants/${PLANT_ID}`);
    await screen.findByText('Care history');
    await waitFor(() => expect(screen.queryByText('Health checks')).toBeNull());
  });
});
