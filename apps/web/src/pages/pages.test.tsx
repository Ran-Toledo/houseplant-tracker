import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { ToastProvider } from '../components/Toast';
import { changeLanguage } from '../i18n';
import { toDateInputValue } from '../lib/format';
import { makePlant, mockApi, species } from '../test/mockApi';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('plant collection', () => {
  it('shows plants from the API with localized species names, keeping nicknames as entered', async () => {
    mockApi({
      'GET /api/plants': () => ({ plants: [makePlant({ nickname: 'Big Bertha', lastWateredAt: new Date().toISOString() })] }),
      'GET /api/plants/locations': () => ({ locations: ['Living room'] }),
      'GET /api/species': () => ({ species }),
    });
    renderAt('/');

    expect(await screen.findByText('Big Bertha')).toBeTruthy();
    expect(screen.getByText('1 plant')).toBeTruthy();
    expect(await screen.findByText('Monstera')).toBeTruthy();
    expect(screen.getByText('Watered today')).toBeTruthy();

    await act(() => changeLanguage('he'));
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByText('הצמחים שלי', { selector: 'h1' })).toBeTruthy();
    expect(screen.getByText('מונסטרה')).toBeTruthy();
    expect(screen.getByText('הושקה היום')).toBeTruthy();
    // User content is never translated.
    expect(screen.getByText('Big Bertha')).toBeTruthy();
  });

  it('shows the empty state when there are no plants', async () => {
    mockApi({
      'GET /api/plants': () => ({ plants: [] }),
      'GET /api/plants/locations': () => ({ locations: [] }),
      'GET /api/species': () => ({ species }),
    });
    renderAt('/');
    expect(await screen.findByText('Your collection is empty')).toBeTruthy();
  });
});

describe('add plant form', () => {
  it('requires a nickname, then creates the plant with known care dates', async () => {
    const created = makePlant({ id: '22222222-2222-4222-8222-222222222222', nickname: 'Fernando' });
    const fetchSpy = mockApi({
      'GET /api/species': () => ({ species }),
      'POST /api/plants': () => ({ plant: created }),
      'GET /api/plants/22222222-2222-4222-8222-222222222222': () => ({ plant: created }),
    });
    renderAt('/plants/new');

    const save = await screen.findByRole('button', { name: 'Save' });
    fireEvent.click(save);
    expect(await screen.findByText('Required')).toBeTruthy();
    expect(fetchSpy.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);

    fireEvent.change(screen.getByLabelText(/Nickname/), { target: { value: '  Fernando ' } });
    fireEvent.change(screen.getByLabelText(/Pot diameter/), { target: { value: '12,5' } });
    fireEvent.change(screen.getByLabelText(/Last watered/), { target: { value: '2026-10-05' } });
    fireEvent.click(save);

    await waitFor(() => expect(fetchSpy.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
    const [, init] = fetchSpy.mock.calls.find(([, i]) => i?.method === 'POST')!;
    const body = JSON.parse(String(init!.body));
    expect(body).toMatchObject({
      nickname: 'Fernando',
      potDiameterCm: 12.5,
      speciesId: null,
      condition: 'unknown',
      initialActivities: [{ activityType: 'watering' }],
    });
  });

  it('clears a date with its Clear button', async () => {
    mockApi({ 'GET /api/species': () => ({ species }) });
    renderAt('/plants/new');
    const owned = (await screen.findByLabelText(/Owned since/)) as HTMLInputElement;
    fireEvent.change(owned, { target: { value: '2026-01-05' } });
    expect(owned.value).toBe('2026-01-05');
    // The default value stays empty, so the native iOS Clear (a reset to the default) works too.
    expect(owned.defaultValue).toBe('');
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear date' })[0]!);
    expect(owned.value).toBe('');
    expect(screen.queryByRole('button', { name: 'Clear date' })).toBeNull();
  });

  it('rejects an invalid pot diameter without calling the API', async () => {
    mockApi({ 'GET /api/species': () => ({ species }) });
    renderAt('/plants/new');
    fireEvent.change(await screen.findByLabelText(/Nickname/), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText(/Pot diameter/), { target: { value: '-4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a number greater than 0')).toBeTruthy();
  });
});

describe('edit plant form', () => {
  it('edits care dates through the care history and replaces the photo', async () => {
    const plant = makePlant({
      lastWateredAt: '2026-10-10T09:00:00.000Z',
      lastRepottedAt: '2026-06-03T09:00:00.000Z',
    });
    const calls: string[] = [];
    const posted: unknown[] = [];
    mockApi({
      'GET /api/species': () => ({ species }),
      [`GET /api/plants/${plant.id}`]: () => ({ plant }),
      [`PATCH /api/plants/${plant.id}`]: () => {
        calls.push('patch');
        return { plant };
      },
      [`GET /api/plants/${plant.id}/activities`]: () => ({
        activities: [
          { id: 'w-old', plantId: plant.id, activityType: 'watering', performedAt: '2026-10-01T09:00:00.000Z', notes: null, createdAt: '' },
          { id: 'w-new', plantId: plant.id, activityType: 'watering', performedAt: '2026-10-10T09:00:00.000Z', notes: 'deep soak', createdAt: '' },
          { id: 'r-1', plantId: plant.id, activityType: 'repotting', performedAt: '2026-06-03T09:00:00.000Z', notes: null, createdAt: '' },
        ],
      }),
      [`POST /api/plants/${plant.id}/activities`]: (_url, init) => {
        posted.push(JSON.parse(String(init.body)));
        return { activity: {} };
      },
      [`DELETE /api/plants/${plant.id}/activities/w-new`]: () => calls.push('delete w-new'),
      [`DELETE /api/plants/${plant.id}/activities/r-1`]: () => calls.push('delete r-1'),
      [`POST /api/plants/${plant.id}/photos`]: () => {
        calls.push('photo');
        return { photo: {} };
      },
    });
    const view = renderAt(`/plants/${plant.id}/edit`);

    const watered = (await screen.findByLabelText(/Last watered/)) as HTMLInputElement;
    expect(watered.value).toBe(toDateInputValue(new Date(plant.lastWateredAt!)));
    fireEvent.change(watered, { target: { value: '2026-10-12' } });
    const repotted = screen.getByLabelText(/Last repotted/) as HTMLInputElement;
    fireEvent.click(within(repotted.parentElement!).getByRole('button', { name: 'Clear date' }));
    const file = new File(['x'], 'new.jpg', { type: 'image/jpeg' });
    fireEvent.change(view.container.querySelector('input[type=file]')!, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls).toEqual(['patch', 'delete w-new', 'delete r-1', 'photo']));
    expect(posted).toEqual([{ activityType: 'watering', performedAt: expect.any(String), notes: 'deep soak' }]);
  });
});

describe('settings: AI features', () => {
  const config = (ai: Record<string, unknown>) => ({
    config: {
      ai: { configured: true, enabled: true, available: true, model: 'gpt-test', usedThisMonth: 12, monthlyLimit: 300, ...ai },
      push: { available: false, vapidPublicKey: null, appUrl: null },
      timezone: 'Asia/Jerusalem',
    },
  });

  it('shows status and usage, and turns AI off', async () => {
    let enabled = true;
    const patches: unknown[] = [];
    mockApi({
      'GET /api/species': () => ({ species }),
      'GET /api/config': () => config({ enabled, available: enabled }),
      'PATCH /api/settings': (_url, init) => {
        patches.push(JSON.parse(String(init.body)));
        enabled = false;
        return { settings: {} };
      },
    });
    renderAt('/settings');

    expect(await screen.findByText('12 of 300')).toBeTruthy();
    // The Notifications section has its own On/Off pill, so look inside the AI section only.
    const ai = within(screen.getByRole('region', { name: 'AI features' }));
    expect(ai.getByText('gpt-test')).toBeTruthy();
    expect(ai.getByText('On')).toBeTruthy();

    fireEvent.click(ai.getByRole('button', { name: 'Turn AI features off' }));
    expect(await ai.findByText('Off')).toBeTruthy();
    expect(patches).toEqual([{ aiEnabled: false }]);
    expect(ai.getByRole('button', { name: 'Turn AI features on' })).toBeTruthy();
  });

  it('explains how to set up AI when no key is configured', async () => {
    mockApi({
      'GET /api/species': () => ({ species }),
      'GET /api/config': () => config({ configured: false, available: false, model: null, usedThisMonth: 0 }),
    });
    renderAt('/settings');

    expect(await screen.findByText('Not set up')).toBeTruthy();
    expect(screen.getByText(/add an OpenAI API key/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Turn AI features/ })).toBeNull();
  });
});

describe('watering reminders', () => {
  const PLANT_ID = '11111111-1111-4111-8111-111111111111';
  const overdue = {
    dueOn: '2026-10-17',
    daysUntil: -2,
    status: 'overdue' as const,
    intervalDays: 8,
    basis: 'history' as const,
    basedOnWaterings: 5,
    snoozedUntil: null,
  };
  const dueItem = {
    plantId: PLANT_ID,
    nickname: 'My Monstera',
    speciesId: 'monstera-deliciosa',
    customSpeciesName: null,
    location: 'Living room',
    coverPhoto: null,
    scheduleId: 'schedule-1',
    activityType: 'watering' as const,
    due: overdue,
  };
  const schedule = {
    id: 'schedule-1',
    plantId: PLANT_ID,
    activityType: 'watering',
    mode: 'adaptive',
    intervalDays: null,
    enabled: true,
    snoozedUntil: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    due: overdue,
  };

  it('shows a bell with the due count on My plants that opens the Notifications page', async () => {
    let watered = false;
    const fetchSpy = mockApi({
      'GET /api/plants': () => ({ plants: [makePlant({ wateringDue: watered ? null : overdue })] }),
      'GET /api/plants/locations': () => ({ locations: [] }),
      'GET /api/species': () => ({ species }),
      'GET /api/due': () => ({ items: watered ? [] : [dueItem] }),
      [`POST /api/plants/${PLANT_ID}/activities`]: () => {
        watered = true;
        return { activity: { id: 'a1' } };
      },
    });
    renderAt('/');

    // My plants keeps the card badge, but the list itself moved to the Notifications page.
    expect(await screen.findByText('Check soil')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Needs care/ })).toBeNull();
    const bell = await screen.findByRole('link', { name: 'Notifications, 1 plant needs care' });
    fireEvent.click(bell);

    expect(await screen.findByRole('heading', { name: 'Notifications', level: 1 })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: /Needs care/ })).toBeTruthy();
    expect(screen.getByText('Soil check overdue by 2 days')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'My Plants' })).toBeTruthy(); // back arrow
    expect(screen.queryByRole('link', { name: /^Notifications/ })).toBeNull(); // the bell is only on My plants

    fireEvent.click(screen.getByRole('button', { name: 'Watered My Monstera' }));
    expect(await screen.findByText(/You're all caught up/)).toBeTruthy();
    const post = fetchSpy.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({ activityType: 'watering' });

    fireEvent.click(screen.getByRole('link', { name: 'My Plants' }));
    expect(await screen.findByRole('link', { name: 'Notifications' })).toBeTruthy(); // no count once watered
  });

  it('shows the next check on the plant page and switches to a fixed interval', async () => {
    const puts: unknown[] = [];
    mockApi({
      [`GET /api/plants/${PLANT_ID}`]: () => ({ plant: makePlant({ wateringDue: overdue }) }),
      [`GET /api/plants/${PLANT_ID}/activities`]: () => ({ activities: [] }),
      [`GET /api/plants/${PLANT_ID}/photos`]: () => ({ photos: [] }),
      [`GET /api/plants/${PLANT_ID}/schedules`]: () => ({ schedules: [schedule] }),
      [`PUT /api/plants/${PLANT_ID}/schedules/watering`]: (_url, init) => {
        puts.push(JSON.parse(String(init.body)));
        return { schedule: { ...schedule, mode: 'fixed', intervalDays: 7 } };
      },
      'GET /api/species': () => ({ species }),
      'GET /api/due': () => ({ items: [dueItem] }),
    });
    renderAt(`/plants/${PLANT_ID}`);

    expect(await screen.findByText('Soil check overdue by 2 days')).toBeTruthy();
    expect(screen.getByText('Based on your last 5 waterings')).toBeTruthy();
    const select = await screen.findByLabelText('Reminder');
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe('adaptive'));
    expect(screen.getByRole('button', { name: 'tomorrow' })).toBeTruthy(); // snooze, shown while due

    fireEvent.change(select, { target: { value: 'fixed' } });
    await waitFor(() => expect(puts).toEqual([{ enabled: true, mode: 'fixed', intervalDays: 7 }]));
  });

  it('turns on an automatic reminder for a new plant unless unticked', async () => {
    const created = makePlant({ id: '33333333-3333-4333-8333-333333333333', nickname: 'Ivy' });
    const run = async (untick: boolean) => {
      const fetchSpy = mockApi({
        'GET /api/species': () => ({ species }),
        'POST /api/plants': () => ({ plant: created }),
        [`PUT /api/plants/${created.id}/schedules/watering`]: () => ({ schedule }),
        [`GET /api/plants/${created.id}`]: () => ({ plant: created }),
      });
      const view = renderAt('/plants/new');
      fireEvent.change(await screen.findByLabelText(/Nickname/), { target: { value: 'Ivy' } });
      const toggle = screen.getByRole('checkbox', { name: /Remind me to check the soil/ });
      expect((toggle as HTMLInputElement).checked).toBe(true);
      if (untick) fireEvent.click(toggle);
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(fetchSpy.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull());
      const puts = fetchSpy.mock.calls.filter(([, init]) => init?.method === 'PUT').map(([, init]) => JSON.parse(String(init!.body)));
      view.unmount();
      fetchSpy.mockRestore();
      return puts;
    };
    expect(await run(false)).toEqual([{ enabled: true, mode: 'adaptive' }]);
    expect(await run(true)).toEqual([]);
  });
});
