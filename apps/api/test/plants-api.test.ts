import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

let t: ReturnType<typeof createTestApp>;
beforeEach(() => {
  t = createTestApp();
});

const createPlant = async (body: Record<string, unknown> = {}) => {
  const res = await t.json('POST', '/api/plants', { nickname: 'Fern Gully', ...body });
  expect(res.status).toBe(201);
  return res.body.plant;
};

const count = (table: 'plants' | 'activities' | 'photos') =>
  t.db.get<{ n: number }>(sql.raw(`select count(*) as n from ${table}`))!.n;

describe('plants API — CRUD', () => {
  it('creates a plant with defaults and returns it', async () => {
    const plant = await createPlant({ speciesId: 'test-plant', location: 'Living room', potDiameterCm: 22 });
    expect(plant).toMatchObject({
      nickname: 'Fern Gully',
      speciesId: 'test-plant',
      location: 'Living room',
      potDiameterCm: 22,
      condition: 'unknown',
      notes: null,
      lastWateredAt: null,
      lastRepottedAt: null,
      coverPhoto: null,
    });
    expect(plant.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(plant.createdAt).toBe(plant.updatedAt);

    const fetched = await t.json('GET', `/api/plants/${plant.id}`);
    expect(fetched.body.plant).toEqual(plant);
  });

  it('stores user text exactly as written, including Hebrew', async () => {
    const plant = await createPlant({ nickname: 'המונסטרה שלי', notes: 'מקבלת שמש בבוקר 🌱' });
    expect(plant.nickname).toBe('המונסטרה שלי');
    expect(plant.notes).toBe('מקבלת שמש בבוקר 🌱');
  });

  it('allows plants that are not in the species catalog', async () => {
    const plant = await createPlant({ customSpeciesName: 'Hoya carnosa' });
    expect(plant.speciesId).toBeNull();
    expect(plant.customSpeciesName).toBe('Hoya carnosa');
  });

  it('rejects unknown species ids', async () => {
    const res = await t.json('POST', '/api/plants', { nickname: 'X', speciesId: 'not-a-species' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('unknown_species');
  });

  it('returns field-level validation errors', async () => {
    const res = await t.json('POST', '/api/plants', { nickname: '  ', potDiameterCm: -3, condition: 'great' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['nickname', 'potDiameterCm', 'condition']));
  });

  it('rejects unknown fields and malformed JSON', async () => {
    expect((await t.json('POST', '/api/plants', { nickname: 'X', isAwesome: true })).status).toBe(400);
    const res = await t.app.request('/api/plants', { method: 'POST', body: '{nope', headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_json');
  });

  it('rejects oversized JSON bodies', async () => {
    const res = await t.json('POST', '/api/plants', { nickname: 'X', notes: 'a'.repeat(100_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('payload_too_large');
  });

  it('turns blank optional text into null', async () => {
    const plant = await createPlant({ location: '   ', notes: '' });
    expect(plant.location).toBeNull();
    expect(plant.notes).toBeNull();
  });

  it('updates only the provided fields and can clear fields with null', async () => {
    const plant = await createPlant({ location: 'Office', notes: 'keep' });
    const res = await t.json('PATCH', `/api/plants/${plant.id}`, { location: null, condition: 'healthy' });
    expect(res.status).toBe(200);
    expect(res.body.plant).toMatchObject({ location: null, condition: 'healthy', notes: 'keep', nickname: 'Fern Gully' });
    expect(res.body.plant.updatedAt >= plant.updatedAt).toBe(true);
  });

  it('rejects empty updates and unknown species on update', async () => {
    const plant = await createPlant();
    expect((await t.json('PATCH', `/api/plants/${plant.id}`, {})).status).toBe(400);
    expect((await t.json('PATCH', `/api/plants/${plant.id}`, { speciesId: 'nope' })).body.error.code).toBe('unknown_species');
  });

  it('returns 404 for missing plants', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    for (const [method, body] of [['GET'], ['PATCH', { nickname: 'x' }], ['DELETE']] as const) {
      const res = await t.json(method, `/api/plants/${missing}`, body);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: 'not_found', message: 'Plant not found' } });
    }
  });

  it('deletes a plant and cascades its activities', async () => {
    const plant = await createPlant({
      initialActivities: [{ activityType: 'watering', performedAt: '2026-10-01T09:00:00Z' }],
    });
    expect(count('activities')).toBe(1);
    expect((await t.json('DELETE', `/api/plants/${plant.id}`)).status).toBe(204);
    expect(count('plants')).toBe(0);
    expect(count('activities')).toBe(0);
    expect((await t.json('GET', `/api/plants/${plant.id}`)).status).toBe(404);
  });
});

describe('plants API — listing and search', () => {
  it('lists newest first, searches by text and species names, filters by location and condition', async () => {
    await createPlant({ nickname: 'Bob', location: 'Office', condition: 'healthy' });
    await createPlant({ nickname: 'Alice', location: 'Bedroom', condition: 'needs-attention', speciesId: 'test-plant' });
    await createPlant({ nickname: '100% cotton', location: 'office' });

    const names = async (query = '') =>
      (await t.json('GET', `/api/plants${query}`)).body.plants.map((p: { nickname: string }) => p.nickname);

    expect(await names()).toEqual(['100% cotton', 'Alice', 'Bob']);
    expect(await names('?q=ali')).toEqual(['Alice']);
    // Matches the catalog species' English and Hebrew common names.
    expect(await names('?q=Test%20Plant')).toEqual(['Alice']);
    expect(await names(`?q=${encodeURIComponent('צמח')}`)).toEqual(['Alice']);
    // LIKE wildcards in user input are matched literally.
    expect(await names('?q=%25')).toEqual(['100% cotton']);
    expect(await names('?location=OFFICE')).toEqual(['100% cotton', 'Bob']);
    expect(await names('?condition=healthy')).toEqual(['Bob']);
    expect((await t.json('GET', '/api/plants?condition=wilted')).status).toBe(400);

    expect((await t.json('GET', '/api/plants/locations')).body.locations).toEqual(['Bedroom', 'Office', 'office']);
  });
});

describe('activities API', () => {
  it('records initial history and derives the latest watering and repotting dates', async () => {
    const plant = await createPlant({
      initialActivities: [
        { activityType: 'watering', performedAt: '2026-09-20T08:00:00Z' },
        { activityType: 'repotting', performedAt: '2026-05-01T10:00:00+03:00' },
      ],
    });
    expect(plant.lastWateredAt).toBe('2026-09-20T08:00:00.000Z');
    // Timestamps are normalized to UTC.
    expect(plant.lastRepottedAt).toBe('2026-05-01T07:00:00.000Z');

    const later = await t.json('POST', `/api/plants/${plant.id}/activities`, {
      activityType: 'watering',
      performedAt: '2026-10-11T07:30:00Z',
      notes: 'Watered today',
    });
    expect(later.status).toBe(201);
    // An older entry added afterwards doesn't change "last watered".
    await t.json('POST', `/api/plants/${plant.id}/activities`, { activityType: 'watering', performedAt: '2026-01-01T00:00:00Z' });
    await t.json('POST', `/api/plants/${plant.id}/activities`, { activityType: 'fertilizing', performedAt: '2026-10-12T00:00:00Z' });

    const refreshed = (await t.json('GET', `/api/plants/${plant.id}`)).body.plant;
    expect(refreshed.lastWateredAt).toBe('2026-10-11T07:30:00.000Z');

    const history = (await t.json('GET', `/api/plants/${plant.id}/activities`)).body.activities;
    expect(history.map((a: { activityType: string }) => a.activityType)).toEqual([
      'fertilizing',
      'watering',
      'watering',
      'repotting',
      'watering',
    ]);

    // Deleting the latest watering falls back to the previous one.
    expect((await t.json('DELETE', `/api/plants/${plant.id}/activities/${later.body.activity.id}`)).status).toBe(204);
    expect((await t.json('GET', `/api/plants/${plant.id}`)).body.plant.lastWateredAt).toBe('2026-09-20T08:00:00.000Z');
  });

  it('validates activity input', async () => {
    const plant = await createPlant();
    const bad = await t.json('POST', `/api/plants/${plant.id}/activities`, { activityType: 'singing', performedAt: 'yesterday' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(['activityType', 'performedAt']);
  });

  it('returns 404 for activities of missing plants or other plants', async () => {
    const a = await createPlant();
    const b = await createPlant();
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await t.json('GET', `/api/plants/${missing}/activities`)).status).toBe(404);
    expect(
      (await t.json('POST', `/api/plants/${missing}/activities`, { activityType: 'watering', performedAt: '2026-10-11T07:30:00Z' })).status,
    ).toBe(404);

    const activity = (
      await t.json('POST', `/api/plants/${a.id}/activities`, { activityType: 'watering', performedAt: '2026-10-11T07:30:00Z' })
    ).body.activity;
    // An activity can only be deleted through the plant it belongs to.
    expect((await t.json('DELETE', `/api/plants/${b.id}/activities/${activity.id}`)).status).toBe(404);
  });
});

describe('database constraints', () => {
  it('enforces foreign keys', () => {
    const insertOrphan = t.db.$client.prepare(
      `insert into activities (id, plant_id, activity_type, performed_at, created_at)
       values ('x', 'no-such-plant', 'watering', 'now', 'now')`,
    );
    expect(() => insertOrphan.run()).toThrow(/FOREIGN KEY/);
  });
});
