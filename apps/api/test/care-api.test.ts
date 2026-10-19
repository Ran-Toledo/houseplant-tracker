import { describe, expect, it } from 'vitest';
import { createCatalog } from '../src/catalog/loader';
import { makeSpecies } from './fixtures/species';
import { createTestApp } from './helpers';

// Monday 19 October 2026, 12:00 in Jerusalem (UTC+3): outside the growing months (3–9), so "dormant".
const NOW = new Date('2026-10-19T09:00:00Z');

const catalog = createCatalog([
  {
    ...makeSpecies('test-plant', 'Test Plant'),
    careProfile: {
      light: { preferred: 'bright-indirect', tolerates: ['medium'] },
      watering: { dryBeforeWatering: 'top-layer', checkEveryDays: { growing: [5, 8], dormant: [8, 14] } },
      growingMonths: [3, 4, 5, 6, 7, 8, 9],
      fertilizeEveryDays: { growing: 30 },
      humidity: 'medium',
    },
  },
]);

async function setup(waterings: string[] = ['2026-10-10T08:00:00+03:00']) {
  let clock = NOW;
  const t = createTestApp({ catalog, now: () => clock });
  const created = await t.json('POST', '/api/plants', {
    nickname: 'Fern Gully',
    speciesId: 'test-plant',
    initialActivities: waterings.map((performedAt) => ({ activityType: 'watering', performedAt })),
  });
  const plantId: string = created.body.plant.id;
  return { ...t, plantId, setClock: (d: Date) => (clock = d) };
}

const adaptive = { enabled: true, mode: 'adaptive' };

describe('care schedules API', () => {
  it('has no reminder until one is turned on', async () => {
    const t = await setup();
    expect((await t.json('GET', `/api/plants/${t.plantId}`)).body.plant.wateringDue).toBeNull();
    expect((await t.json('GET', `/api/plants/${t.plantId}/schedules`)).body.schedules).toEqual([]);
    expect((await t.json('GET', '/api/due?days=7')).body.items).toEqual([]);
  });

  it('turns on an adaptive reminder based on the species range for the season', async () => {
    const t = await setup();
    const res = await t.json('PUT', `/api/plants/${t.plantId}/schedules/watering`, adaptive);
    expect(res.status).toBe(200);
    // Last watered 10 October; dormant range starts at 8 days → due 18 October, one day overdue.
    expect(res.body.schedule).toMatchObject({
      plantId: t.plantId,
      activityType: 'watering',
      mode: 'adaptive',
      intervalDays: null,
      enabled: true,
      due: { dueOn: '2026-10-18', daysUntil: -1, status: 'overdue', intervalDays: 8, basis: 'species' },
    });
    expect((await t.json('GET', '/api/plants')).body.plants[0].wateringDue).toMatchObject({ status: 'overdue' });
  });

  it('lists due plants, most urgent first, and clears them when watered', async () => {
    const t = await setup();
    await t.json('PUT', `/api/plants/${t.plantId}/schedules/watering`, adaptive);
    const other = (await t.json('POST', '/api/plants', { nickname: 'Aloe' })).body.plant.id;
    await t.json('PUT', `/api/plants/${other}/schedules/watering`, { enabled: true, mode: 'fixed', intervalDays: 1 });

    let due = (await t.json('GET', '/api/due?days=1')).body.items;
    expect(due.map((i: { nickname: string; due: { status: string } }) => [i.nickname, i.due.status])).toEqual([
      ['Fern Gully', 'overdue'],
      ['Aloe', 'soon'], // no watering yet: counted from the schedule's creation today
    ]);
    expect((await t.json('GET', '/api/due')).body.items).toHaveLength(1); // days defaults to 0

    await t.json('POST', `/api/plants/${t.plantId}/activities`, { activityType: 'watering', performedAt: NOW.toISOString() });
    due = (await t.json('GET', '/api/due?days=1')).body.items;
    expect(due.map((i: { nickname: string }) => i.nickname)).toEqual(['Aloe']);
    expect((await t.json('GET', `/api/plants/${t.plantId}`)).body.plant.wateringDue).toMatchObject({ dueOn: '2026-10-27', status: 'later' });
  });

  it('follows the plant’s own watering pattern once there are three waterings', async () => {
    const t = await setup(['2026-10-01T09:00:00+03:00', '2026-10-05T09:00:00+03:00', '2026-10-09T09:00:00+03:00', '2026-10-14T09:00:00+03:00']);
    const { due } = (await t.json('PUT', `/api/plants/${t.plantId}/schedules/watering`, adaptive)).body.schedule;
    // Intervals 4, 4, 5 → median 4; within [ceil(8 / 2), 14 × 2].
    expect(due).toMatchObject({ basis: 'history', intervalDays: 4, basedOnWaterings: 4, dueOn: '2026-10-18' });
  });

  it('supports fixed intervals and validates them', async () => {
    const t = await setup();
    const fixed = await t.json('PUT', `/api/plants/${t.plantId}/schedules/watering`, { enabled: true, mode: 'fixed', intervalDays: 12 });
    expect(fixed.body.schedule).toMatchObject({ mode: 'fixed', intervalDays: 12, due: { dueOn: '2026-10-22', basis: 'fixed', status: 'later' } });

    const missing = await t.json('PUT', `/api/plants/${t.plantId}/schedules/watering`, { enabled: true, mode: 'fixed' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details[0].path).toBe('intervalDays');
    expect((await t.json('PUT', `/api/plants/${t.plantId}/schedules/watering`, { enabled: true, mode: 'fixed', intervalDays: 0 })).status).toBe(400);
    expect((await t.json('PUT', `/api/plants/${t.plantId}/schedules/repotting`, adaptive)).status).toBe(400);
    expect((await t.json('PUT', '/api/plants/00000000-0000-4000-8000-000000000000/schedules/watering', adaptive)).status).toBe(404);
  });

  it('snoozes a reminder until watering is logged', async () => {
    const t = await setup();
    const { id } = (await t.json('PUT', `/api/plants/${t.plantId}/schedules/watering`, adaptive)).body.schedule;
    const snoozed = await t.json('POST', `/api/schedules/${id}/snooze`, { days: 3 });
    expect(snoozed.status).toBe(200);
    expect(snoozed.body.schedule).toMatchObject({ snoozedUntil: '2026-10-22', due: { dueOn: '2026-10-22', status: 'later' } });
    expect((await t.json('GET', '/api/due?days=1')).body.items).toEqual([]);

    await t.json('POST', `/api/plants/${t.plantId}/activities`, { activityType: 'watering', performedAt: NOW.toISOString() });
    expect((await t.json('GET', `/api/plants/${t.plantId}/schedules`)).body.schedules[0].snoozedUntil).toBeNull();

    expect((await t.json('POST', `/api/schedules/${id}/snooze`, { days: 30 })).status).toBe(400);
    expect((await t.json('POST', '/api/schedules/00000000-0000-4000-8000-000000000000/snooze', { days: 1 })).status).toBe(404);
  });

  it('turns a reminder off and on again, and removes it with the plant', async () => {
    const t = await setup();
    await t.json('PUT', `/api/plants/${t.plantId}/schedules/watering`, adaptive);
    const off = await t.json('PUT', `/api/plants/${t.plantId}/schedules/watering`, { enabled: false, mode: 'adaptive' });
    expect(off.body.schedule).toMatchObject({ enabled: false, due: null });
    expect((await t.json('GET', `/api/plants/${t.plantId}`)).body.plant.wateringDue).toBeNull();
    expect((await t.json('GET', '/api/due?days=30')).body.items).toEqual([]);

    await t.json('DELETE', `/api/plants/${t.plantId}`);
    expect(t.db.$client.prepare('select count(*) as n from care_schedules').get()).toEqual({ n: 0 });
  });

  it('works out "today" in the owner’s time zone', async () => {
    const t = await setup();
    await t.json('PUT', `/api/plants/${t.plantId}/schedules/watering`, { enabled: true, mode: 'fixed', intervalDays: 9 });
    // 19 October 22:30 UTC is already 20 October in Jerusalem, but still the 19th in UTC.
    t.setClock(new Date('2026-10-19T22:30:00Z'));
    expect((await t.json('GET', `/api/plants/${t.plantId}`)).body.plant.wateringDue).toMatchObject({ dueOn: '2026-10-19', daysUntil: -1 });
    await t.json('PATCH', '/api/settings', { timezone: 'UTC' });
    expect((await t.json('GET', `/api/plants/${t.plantId}`)).body.plant.wateringDue).toMatchObject({ daysUntil: 0, status: 'today' });
  });
});
