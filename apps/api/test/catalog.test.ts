import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CatalogValidationError, loadCatalog } from '../src/catalog/loader';
import { makeSpecies } from './fixtures/species';
import { tempDir, writeJson } from './helpers';

async function expectProblems(dir: string): Promise<string[]> {
  const err = await loadCatalog(dir).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(CatalogValidationError);
  return (err as CatalogValidationError).problems;
}

describe('species catalog loader', () => {
  it('loads valid files and indexes them by id', async () => {
    const dir = tempDir();
    writeJson(dir, 'zeta-plant.json', makeSpecies('zeta-plant', 'Zeta'));
    writeJson(dir, 'alpha-plant.json', makeSpecies('alpha-plant', 'Alpha'));

    const catalog = await loadCatalog(dir);
    expect(catalog.size).toBe(2);
    expect(catalog.get('alpha-plant')?.localizations.he.commonName).toBe('צמח Alpha');
    expect(catalog.has('missing')).toBe(false);
    expect(catalog.get('missing')).toBeUndefined();
    // Sorted by English common name.
    expect(catalog.list().map((s) => s.id)).toEqual(['alpha-plant', 'zeta-plant']);
  });

  it('reports invalid JSON', async () => {
    const dir = tempDir();
    writeJson(dir, 'broken.json', '{ "id": ');
    const problems = await expectProblems(dir);
    expect(problems[0]).toMatch(/broken\.json: invalid JSON/);
  });

  it('reports schema problems with the file and field path', async () => {
    const dir = tempDir();
    const species = makeSpecies('bad-plant');
    (species as { scientificName: string }).scientificName = '';
    writeJson(dir, 'bad-plant.json', species);
    const problems = await expectProblems(dir);
    expect(problems).toContainEqual(expect.stringMatching(/^bad-plant\.json: scientificName: /));
  });

  it('rejects a missing Hebrew localization', async () => {
    const dir = tempDir();
    const species = makeSpecies('no-hebrew') as unknown as { localizations: Record<string, unknown> };
    delete species.localizations.he;
    writeJson(dir, 'no-hebrew.json', species);
    const problems = await expectProblems(dir);
    expect(problems).toContainEqual(expect.stringContaining('localizations.he'));
  });

  it('rejects missing translated fields inside a localization', async () => {
    const dir = tempDir();
    const species = makeSpecies('partial-hebrew');
    (species.localizations.he.care.watering as { summary?: string }).summary = undefined;
    writeJson(dir, 'partial-hebrew.json', species);
    const problems = await expectProblems(dir);
    expect(problems).toContainEqual(expect.stringContaining('localizations.he.care.watering.summary'));
  });

  it('rejects unknown fields to catch typos', async () => {
    const dir = tempDir();
    writeJson(dir, 'typo-plant.json', { ...makeSpecies('typo-plant'), scientficName: 'x' });
    const problems = await expectProblems(dir);
    expect(problems.join('\n')).toMatch(/scientficName/);
  });

  it('rejects duplicate ids', async () => {
    const dir = tempDir();
    writeJson(dir, 'same-plant.json', makeSpecies('same-plant'));
    writeJson(dir, 'same-plant-copy.json', makeSpecies('same-plant'));
    const problems = await expectProblems(dir);
    expect(problems.join('\n')).toMatch(/duplicate species id "same-plant"/);
  });

  it('requires the file name to match the id', async () => {
    const dir = tempDir();
    writeJson(dir, 'wrong-name.json', makeSpecies('right-name'));
    const problems = await expectProblems(dir);
    expect(problems[0]).toMatch(/expected "right-name\.json"/);
  });

  it('requires sources before an entry can be marked reviewed', async () => {
    const dir = tempDir();
    const species = makeSpecies('reviewed-plant');
    species.researchMetadata = { status: 'reviewed', reviewedAt: '2026-10-01', method: 'x', sources: [] };
    writeJson(dir, 'reviewed-plant.json', species);
    const problems = await expectProblems(dir);
    expect(problems.join('\n')).toMatch(/reviewed entries need/);
  });

  it('checks that referenced images exist and resolves their paths', async () => {
    const dir = tempDir();
    const image = { author: 'A', license: 'CC0', licenseUrl: null, sourceUrl: 'https://example.org/p' };
    writeJson(dir, 'with-image.json', { ...makeSpecies('with-image'), image: { ...image, file: 'with-image.jpg' } });
    fs.mkdirSync(path.join(dir, 'images'));
    fs.writeFileSync(path.join(dir, 'images', 'with-image.jpg'), 'jpg');

    const catalog = await loadCatalog(dir);
    expect(catalog.imagePath('with-image')).toBe(path.join(dir, 'images', 'with-image.jpg'));
    expect(catalog.list()[0]?.imageUrl).toBe('/api/species/with-image/image');

    writeJson(dir, 'no-file.json', { ...makeSpecies('no-file'), image: { ...image, file: 'no-file.jpg' } });
    expect((await expectProblems(dir))[0]).toMatch(/no-file\.json: image\.file: "no-file\.jpg" not found/);
  });

  it('rejects image file names that could escape the images folder', async () => {
    const dir = tempDir();
    const image = { file: '../plants.sqlite', author: 'A', license: 'CC0', licenseUrl: null, sourceUrl: 'https://example.org/p' };
    writeJson(dir, 'bad-image.json', { ...makeSpecies('bad-image'), image });
    expect((await expectProblems(dir)).join('\n')).toMatch(/image\.file/);
  });

  it('validates the real species catalog', async () => {
    const catalog = await loadCatalog(path.resolve(import.meta.dirname, '../../../species-catalog'));
    expect(catalog.size).toBeGreaterThan(0);
  });
});
