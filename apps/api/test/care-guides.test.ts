import type { Species } from '@houseplant/shared';
import { describe, expect, it } from 'vitest';
import { createFakeProvider, type FakeEmbedBehaviour, fakeEmbedding } from '../src/ai/fake-provider';
import type { AiProvider } from '../src/ai/provider';
import { createAiService } from '../src/ai/service';
import { careGuideSections, createCareGuideIndex } from '../src/assistant/care-guides';
import { createCatalog } from '../src/catalog/loader';
import { openDatabase, type Db } from '../src/db/client';
import { ApiError } from '../src/middleware/errors';
import { createAiRequestRepository } from '../src/repositories/ai-requests';
import { createCareGuideSectionRepository } from '../src/repositories/care-guide-sections';
import { createSettingsRepository } from '../src/repositories/settings';
import { createSettingsService } from '../src/services/settings';
import { makeSpecies } from './fixtures/species';

const NOW = new Date('2026-10-19T09:00:00Z');
const SECTION_KEYS = [
  'overview',
  'light',
  'watering',
  'watering-signs',
  'temperature',
  'humidity',
  'soil',
  'fertilizing',
  'repotting',
  'pruning',
  'propagation',
  'warning-signs',
  'problem-1',
  'toxicity',
];

/** A species whose only common problem is `problem`, in English. */
function withProblem(id: string, name: string, problem: { problem: string; possibleCauses: string[]; whatToDo: string }): Species {
  const s = makeSpecies(id, name);
  return { ...s, localizations: { ...s.localizations, en: { ...s.localizations.en, commonProblems: [problem] } } };
}

const fern = withProblem('fern', 'Fern', {
  problem: 'Fine webbing under the leaves',
  possibleCauses: ['Spider mites in dry air'],
  whatToDo: 'Rinse the leaves and raise the humidity.',
});
const cactus = withProblem('cactus', 'Cactus', {
  problem: 'Mushy black stem base',
  possibleCauses: ['Root rot from soggy soil'],
  whatToDo: 'Cut away the rot and repot into dry gritty mix.',
});

function setup(
  opts: {
    db?: Db;
    species?: Species[];
    provider?: AiProvider | null;
    embedding?: (inputs: string[]) => FakeEmbedBehaviour;
  } = {},
) {
  const db = opts.db ?? openDatabase(':memory:');
  const settings = createSettingsService(createSettingsRepository(db));
  const fake = createFakeProvider(() => ({ output: {} }), 'fake-model', undefined, opts.embedding);
  const provider = opts.provider === undefined ? fake : opts.provider;
  const ai = createAiService({ provider, settings, requests: createAiRequestRepository(db), now: () => NOW });
  const index = createCareGuideIndex({
    catalog: createCatalog(opts.species ?? [fern, cactus]),
    sections: createCareGuideSectionRepository(db),
    ai,
    now: () => NOW,
  });
  const logged = () => db.$client.prepare('select kind, model, status from ai_requests').all() as { kind: string; model: string; status: string }[];
  const stored = () => (db.$client.prepare('select count(*) as n from care_guide_sections').get() as { n: number }).n;
  return { db, settings, fake, index, logged, stored };
}

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  return err as ApiError;
}

describe('careGuideSections', () => {
  it('splits a guide into named sections in both languages', () => {
    const sections = careGuideSections(makeSpecies('test-plant', 'Test Plant'));
    expect(sections.filter((s) => s.lang === 'en').map((s) => s.sectionKey)).toEqual(SECTION_KEYS);
    expect(sections.filter((s) => s.lang === 'he').map((s) => s.sectionKey)).toEqual(SECTION_KEYS);

    const signs = sections.find((s) => s.id === 'test-plant:en:watering-signs')!;
    expect(signs.content).toBe('Overwatering signs: yellow leaves.\nUnderwatering signs: crispy leaves.');
    expect(signs.embedText).toBe(`Test Plant (Testus plantus) — Signs of overwatering and underwatering\n${signs.content}`);

    const problem = sections.find((s) => s.id === 'test-plant:he:problem-1')!;
    expect(problem.title).toBe('בעיה נפוצה: yellowing');
    expect(problem.embedText.startsWith('צמח Test Plant (Testus plantus) — ')).toBe(true);
    expect(sections.find((s) => s.id === 'test-plant:en:toxicity')!.content).toContain('cats: toxic, dogs: toxic, people: mildly toxic.');
  });
});

describe('care-guide index', () => {
  it('embeds every English section once, in one logged request', async () => {
    const t = setup();
    expect(await t.index.sync()).toEqual({ status: 'synced', embedded: 28, removed: 0, total: 28 });
    expect(t.fake.embedRequests.map((r) => r.length)).toEqual([28]);
    expect(t.fake.embedRequests[0]!.every((text) => !/[֐-׿]/.test(text))).toBe(true);
    expect(t.logged()).toEqual([{ kind: 'embed', model: 'fake-embedding', status: 'ok' }]);
    expect(t.stored()).toBe(28);

    // Nothing changed: no request at all, also from a fresh index on the same database (a restart).
    expect(await t.index.sync()).toMatchObject({ embedded: 0, removed: 0 });
    expect(await setup({ db: t.db }).index.sync()).toMatchObject({ embedded: 0, removed: 0 });
    expect(t.logged()).toHaveLength(1);
  });

  it('re-embeds only changed sections and deletes removed ones', async () => {
    const t = setup();
    await t.index.sync();

    const edited = withProblem('fern', 'Fern', { ...fern.localizations.en.commonProblems[0]!, whatToDo: 'Shower the plant weekly.' });
    const after = setup({ db: t.db, species: [edited] });
    expect(await after.index.sync()).toEqual({ status: 'synced', embedded: 1, removed: 14, total: 14 });
    expect(after.fake.embedRequests).toEqual([[expect.stringContaining('Shower the plant weekly.')]]);
    expect(t.stored()).toBe(14);
  });

  it('re-embeds everything when the embedding model changes', async () => {
    const t = setup();
    await t.index.sync();
    const other = createFakeProvider(() => ({ output: {} }));
    const after = setup({ db: t.db, provider: { ...other, embeddingModel: 'other-embedding' } });
    expect(await after.index.sync()).toMatchObject({ embedded: 28, removed: 0 });
    expect(t.logged().map((r) => r.model)).toEqual(['fake-embedding', 'other-embedding']);
  });

  it('shares one run between concurrent syncs', async () => {
    const t = setup();
    await Promise.all([t.index.sync(), t.index.sync(), t.index.search('webbing', { lang: 'en' })]);
    expect(t.fake.embedRequests.map((r) => r.length)).toEqual([28, 1]);
  });

  it('finds the closest sections by meaning, filtered by language and species', async () => {
    const t = setup();
    const matches = await t.index.search('fine webbing under the leaves, spider mites', { lang: 'en' });
    expect(matches).toHaveLength(5);
    expect(matches[0]).toMatchObject({ speciesId: 'fern', sectionKey: 'problem-1', title: 'Common problem: Fine webbing under the leaves' });
    expect(matches[0]!.score).toBeGreaterThan(matches[1]!.score);
    expect(matches[0]!.score).toBeCloseTo(
      fakeEmbedding('fine webbing under the leaves, spider mites').reduce(
        (sum, v, i) => sum + v * fakeEmbedding(careGuideSections(fern).find((s) => s.id === 'fern:en:problem-1')!.embedText)[i]!,
        0,
      ),
      5,
    );

    const cactusOnly = await t.index.search('fine webbing under the leaves', { lang: 'en', speciesId: 'cactus', limit: 3 });
    expect(cactusOnly).toHaveLength(3);
    expect(cactusOnly.every((m) => m.speciesId === 'cactus')).toBe(true);

    // Ranked against the English sections, returned in Hebrew.
    const english = await t.index.search('fine webbing under the leaves, spider mites', { lang: 'en', limit: 50 });
    const hebrew = await t.index.search('fine webbing under the leaves, spider mites', { lang: 'he', limit: 50 });
    expect(hebrew).toHaveLength(28);
    expect(hebrew.map((m) => [m.speciesId, m.sectionKey, m.score])).toEqual(english.map((m) => [m.speciesId, m.sectionKey, m.score]));
    expect(hebrew[0]).toMatchObject({ title: 'בעיה נפוצה: yellowing', content: expect.stringContaining('סיבות אפשריות') });

    // One request to build the index, then one per search.
    expect(t.logged()).toHaveLength(5);
  });

  it('counts toward the monthly limit', async () => {
    const t = setup();
    t.settings.update({ aiMonthlyRequestLimit: 1 });
    await t.index.sync();
    expect((await apiError(t.index.search('webbing', { lang: 'en' }))).code).toBe('ai_limit_reached');
    expect(t.logged()).toHaveLength(1);
  });

  it('fails when the provider does, and retries on the next search', async () => {
    let fail = true;
    const t = setup({ embedding: (inputs) => (fail ? { error: 'unavailable' } : { vectors: inputs.map(fakeEmbedding) }) });
    expect((await apiError(t.index.sync())).code).toBe('ai_error');
    expect((await apiError(t.index.search('webbing', { lang: 'en' }))).code).toBe('ai_error');
    expect(t.logged().map((r) => r.status)).toEqual(['error', 'error']);

    fail = false;
    expect((await t.index.search('webbing', { lang: 'en' }))[0]).toMatchObject({ speciesId: 'fern' });
    expect(t.stored()).toBe(28);
  });

  it('skips building without an AI provider, and searches fail as not configured', async () => {
    const t = setup({ provider: null });
    expect(await t.index.sync()).toEqual({ status: 'skipped', embedded: 0, removed: 0, total: 28 });
    expect((await apiError(t.index.search('webbing', { lang: 'en' }))).code).toBe('ai_not_configured');
    expect(t.stored()).toBe(0);
  });
});
