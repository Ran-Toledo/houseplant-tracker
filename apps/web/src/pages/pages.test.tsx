import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { ToastProvider } from '../components/Toast';
import { changeLanguage } from '../i18n';
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

  it('rejects an invalid pot diameter without calling the API', async () => {
    mockApi({ 'GET /api/species': () => ({ species }) });
    renderAt('/plants/new');
    fireEvent.change(await screen.findByLabelText(/Nickname/), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText(/Pot diameter/), { target: { value: '-4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a number greater than 0')).toBeTruthy();
  });
});
