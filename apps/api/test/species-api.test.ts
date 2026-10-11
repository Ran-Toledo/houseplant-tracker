import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

const { app } = createTestApp();

describe('species API', () => {
  it('lists species with names in both languages', async () => {
    const res = await app.request('/api/species');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.species).toHaveLength(1);
    expect(body.species[0]).toMatchObject({
      id: 'test-plant',
      scientificName: 'Testus plantus',
      names: { en: { commonName: 'Test Plant' }, he: { commonName: 'צמח Test Plant' } },
      researchStatus: 'draft',
    });
  });

  it('returns full bilingual data for one species', async () => {
    const res = await app.request('/api/species/test-plant');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.species.localizations.en.care.light.summary).toBeTruthy();
    expect(body.species.localizations.he.care.light.summary).toBeTruthy();
  });

  it('returns a 404 error body for unknown species', async () => {
    const res = await app.request('/api/species/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Species not found' } });
  });

  it('returns 404 for the image of a species without one', async () => {
    expect((await app.request('/api/species/test-plant/image')).status).toBe(404);
    expect((await app.request('/api/species/nope/image')).status).toBe(404);
  });

  it('is read-only', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await app.request('/api/species/test-plant', { method });
      expect(res.status).toBe(404);
    }
  });
});
