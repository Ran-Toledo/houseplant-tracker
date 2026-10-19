import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { HealthAssessment, Identification } from '@houseplant/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeProvider, type FakeBehaviour } from '../src/ai/fake-provider';
import type { StructuredRequest } from '../src/ai/provider';
import { createCatalog } from '../src/catalog/loader';
import { makeSpecies } from './fixtures/species';
import { createTestApp } from './helpers';

const NOW = new Date('2026-10-19T09:00:00Z');

const monstera = { ...makeSpecies('monstera-deliciosa', 'Monstera'), scientificName: 'Monstera deliciosa' };
const pothos = { ...makeSpecies('epipremnum-aureum', 'Pothos'), scientificName: 'Epipremnum aureum' };

const png = () =>
  sharp({ create: { width: 80, height: 60, channels: 3, background: { r: 40, g: 120, b: 60 } } }).png().toBuffer();

const both = (text: string) => ({ en: text, he: `${text} (he)` });

const identification: Identification = {
  notAPlant: false,
  candidates: [
    { scientificName: 'Monstera deliciosa', commonName: both('Swiss cheese plant'), catalogSpeciesId: 'monstera-deliciosa', confidence: 'high', reason: both('holes') },
    // Linked by scientific name, although the model gave no id.
    { scientificName: 'epipremnum aureum', commonName: both('Devil’s ivy'), catalogSpeciesId: null, confidence: 'medium', reason: both('vines') },
    // An id that isn't in the catalog is dropped.
    { scientificName: 'Rhaphidophora tetrasperma', commonName: both('Mini monstera'), catalogSpeciesId: 'rhaphidophora-tetrasperma', confidence: 'low', reason: both('small') },
  ],
};

const assessment: HealthAssessment = {
  condition: 'needs-attention',
  confidence: 'medium',
  summary: both('Lower leaves are yellowing'),
  findings: [{ key: 'overwatering', observation: both('Wet soil'), likelihood: 'likely', actions: [both('Water less')] }],
  photoQualityIssue: 'none',
};

let t: ReturnType<typeof createTestApp>;
let provider: ReturnType<typeof createFakeProvider>;
let behaviour: FakeBehaviour;
let plantId: string;

beforeEach(async () => {
  behaviour = { output: identification };
  provider = createFakeProvider(() => behaviour);
  t = createTestApp({ aiProvider: provider, now: () => NOW, catalog: createCatalog([monstera, pothos]) });
  plantId = (await t.json('POST', '/api/plants', { nickname: 'Monty', speciesId: 'monstera-deliciosa', potDiameterCm: 22 })).body.plant.id;
});

async function uploadPhoto(id = plantId): Promise<string> {
  const form = new FormData();
  form.set('photo', new Blob([new Uint8Array(await png())]), 'photo.png');
  const res = await t.app.request(`/api/plants/${id}/photos`, { method: 'POST', body: form });
  return ((await res.json()) as { photo: { id: string } }).photo.id;
}

async function identifyUpload(file: Blob) {
  const form = new FormData();
  form.set('photo', file, 'photo.png');
  const res = await t.app.request('/api/ai/identify', { method: 'POST', body: form });
  return { status: res.status, body: (await res.json()) as any };
}

const lastRequest = (): StructuredRequest => provider.requests.at(-1)!;
const textOf = (request: StructuredRequest) =>
  request.input.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n');
const aiRows = () => t.db.$client.prepare('select id, kind, status, plant_id, photo_id from ai_requests').all() as any[];

describe('identify API', () => {
  it('identifies an uploaded photo, mapping the answer onto the catalog, without storing it', async () => {
    const res = await identifyUpload(new Blob([new Uint8Array(await png())]));
    expect(res.status).toBe(200);
    const [first, second, third] = res.body.identification.candidates;
    // Catalog matches use the catalog's own names.
    expect(first).toMatchObject({ catalogSpeciesId: 'monstera-deliciosa', commonName: { en: 'Monstera', he: 'צמח Monstera' } });
    expect(second).toMatchObject({ catalogSpeciesId: 'epipremnum-aureum', scientificName: 'Epipremnum aureum' });
    expect(third).toMatchObject({ catalogSpeciesId: null, commonName: { en: 'Mini monstera' } });
    expect(res.body.requestId).toBe(aiRows()[0].id);

    const request = lastRequest();
    expect(request.schemaName).toBe('plant_identification');
    expect(textOf(request)).toContain('monstera-deliciosa | Monstera deliciosa | Monstera | צמח Monstera');
    const image = request.input.find((p) => p.type === 'image');
    expect(image?.type === 'image' && image.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);

    expect(aiRows()).toEqual([expect.objectContaining({ kind: 'identify', status: 'ok', plant_id: null, photo_id: null })]);
    expect(fs.existsSync(path.join(t.photosDir, plantId))).toBe(false);
  });

  it('identifies a stored photo and records which plant and photo it was', async () => {
    const photoId = await uploadPhoto();
    const res = await t.json('POST', '/api/ai/identify', { photoId });
    expect(res.status).toBe(200);
    expect(res.body.identification.candidates).toHaveLength(3);
    expect(aiRows()[0]).toMatchObject({ plant_id: plantId, photo_id: photoId });
  });

  it('rejects missing photos, unknown photos and files that are not images', async () => {
    const form = new FormData();
    const noFile = await t.app.request('/api/ai/identify', { method: 'POST', body: form });
    expect(noFile.status).toBe(400);
    expect((await t.json('POST', '/api/ai/identify', { photoId: '0a0b0c0d-0000-4000-8000-000000000000' })).status).toBe(404);
    expect((await t.json('POST', '/api/ai/identify', { photoId: 'nope' })).status).toBe(400);
    expect((await identifyUpload(new Blob(['not an image']))).status).toBe(415);
    expect(provider.requests).toHaveLength(0);
  });

  it('refuses when AI features are switched off', async () => {
    await t.json('PATCH', '/api/settings', { aiEnabled: false });
    const res = await identifyUpload(new Blob([new Uint8Array(await png())]));
    expect([res.status, res.body.error.code]).toEqual([503, 'ai_disabled']);
    expect(provider.requests).toHaveLength(0);
  });

  it('reports not-a-plant answers as they are', async () => {
    behaviour = { output: { notAPlant: true, candidates: [] } };
    const res = await identifyUpload(new Blob([new Uint8Array(await png())]));
    expect(res.body.identification).toEqual({ notAPlant: true, candidates: [] });
  });
});

describe('health checks API', () => {
  beforeEach(() => {
    behaviour = { output: assessment };
  });

  it('checks a photo with the plant’s context and keeps the result', async () => {
    await t.json('POST', `/api/plants/${plantId}/activities`, {
      activityType: 'watering',
      performedAt: '2026-10-16T08:00:00Z',
      notes: 'a lot of water',
    });
    const photoId = await uploadPhoto();

    const res = await t.json('POST', `/api/plants/${plantId}/health-checks`, { photoId });
    expect(res.status).toBe(201);
    expect(res.body.healthCheck).toMatchObject({
      plantId,
      condition: 'needs-attention',
      confidence: 'medium',
      assessment,
      appliedAt: null,
      createdAt: NOW.toISOString(),
      photo: { id: photoId, thumbnailUrl: `/api/photos/${photoId}/thumb` },
    });

    const context = textOf(lastRequest());
    expect(context).toContain('Plant: "Monty". Species: Monstera (Monstera deliciosa).');
    expect(context).toContain('diameter 22 cm');
    expect(context).toContain('- watering, 3 days ago: a lot of water');
    expect(context).toContain('Species care notes for Monstera');
    expect(context).toContain('Current month: October (northern hemisphere)');
    expect(aiRows()[0]).toMatchObject({ kind: 'health', status: 'ok', plant_id: plantId, photo_id: photoId });

    const list = await t.json('GET', `/api/plants/${plantId}/health-checks`);
    expect(list.body.healthChecks.map((c: any) => c.id)).toEqual([res.body.healthCheck.id]);
  });

  it('applies the assessed condition only when asked', async () => {
    const photoId = await uploadPhoto();
    const check = (await t.json('POST', `/api/plants/${plantId}/health-checks`, { photoId })).body.healthCheck;
    expect((await t.json('GET', `/api/plants/${plantId}`)).body.plant.condition).toBe('unknown');

    const res = await t.json('POST', `/api/health-checks/${check.id}/apply`);
    expect(res.status).toBe(200);
    expect(res.body.plant.condition).toBe('needs-attention');
    expect(res.body.healthCheck.appliedAt).toBe(NOW.toISOString());
    expect((await t.json('GET', `/api/plants/${plantId}`)).body.plant.condition).toBe('needs-attention');
  });

  it('only checks photos of the same plant', async () => {
    const other = (await t.json('POST', '/api/plants', { nickname: 'Other' })).body.plant.id;
    const photoId = await uploadPhoto(other);
    const res = await t.json('POST', `/api/plants/${plantId}/health-checks`, { photoId });
    expect(res.status).toBe(400);
    expect(provider.requests).toHaveLength(0);
  });

  it('stores nothing when the answer is unusable', async () => {
    behaviour = { output: { ...assessment, condition: 'great' } };
    const photoId = await uploadPhoto();
    const res = await t.json('POST', `/api/plants/${plantId}/health-checks`, { photoId });
    expect([res.status, res.body.error.code]).toEqual([502, 'ai_invalid_output']);
    expect((await t.json('GET', `/api/plants/${plantId}/health-checks`)).body.healthChecks).toEqual([]);
  });

  it('keeps a check when its photo is deleted, and deletes checks with their plant', async () => {
    const photoId = await uploadPhoto();
    const check = (await t.json('POST', `/api/plants/${plantId}/health-checks`, { photoId })).body.healthCheck;
    await t.json('DELETE', `/api/photos/${photoId}`);
    expect((await t.json('GET', `/api/plants/${plantId}/health-checks`)).body.healthChecks[0]).toMatchObject({
      id: check.id,
      photo: null,
    });

    await t.json('DELETE', `/api/plants/${plantId}`);
    expect(t.db.$client.prepare('select count(*) as n from health_checks').get()).toEqual({ n: 0 });
    // The request log survives, detached from the plant.
    expect(aiRows()[0]).toMatchObject({ plant_id: null, photo_id: null });
  });

  it('deletes a check', async () => {
    const photoId = await uploadPhoto();
    const check = (await t.json('POST', `/api/plants/${plantId}/health-checks`, { photoId })).body.healthCheck;
    expect((await t.json('DELETE', `/api/health-checks/${check.id}`)).status).toBe(204);
    expect((await t.json('DELETE', `/api/health-checks/${check.id}`)).status).toBe(404);
    expect((await t.json('POST', `/api/health-checks/${check.id}/apply`)).status).toBe(404);
  });

  it('returns 404 for unknown plants', async () => {
    expect((await t.json('GET', '/api/plants/0a0b0c0d-0000-4000-8000-000000000000/health-checks')).status).toBe(404);
  });
});
