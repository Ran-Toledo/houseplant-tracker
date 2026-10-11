import fs from 'node:fs/promises';
import path from 'node:path';
import { speciesSchema, toSpeciesSummary, type Species, type SpeciesSummary } from '@houseplant/shared';
import type { z } from 'zod';

/** Read-only, in-memory index of the species JSON files. */
export interface SpeciesCatalog {
  get(id: string): Species | undefined;
  has(id: string): boolean;
  /** Absolute path of the species' image file, if it has one. */
  imagePath(id: string): string | undefined;
  /** Summaries sorted by English common name. */
  list(): SpeciesSummary[];
  readonly size: number;
}

export class CatalogValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Species catalog is invalid:\n  - ${problems.join('\n  - ')}`);
    this.name = 'CatalogValidationError';
  }
}

function formatIssues(file: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const where = issue.path.length ? issue.path.join('.') : '(root)';
    return `${file}: ${where}: ${issue.message}`;
  });
}

export function createCatalog(entries: Species[], imagesDir?: string): SpeciesCatalog {
  const byId = new Map(entries.map((s) => [s.id, s]));
  const summaries = entries
    .map(toSpeciesSummary)
    .sort((a, b) => a.names.en.commonName.localeCompare(b.names.en.commonName));
  return {
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    imagePath: (id) => {
      const file = byId.get(id)?.image?.file;
      // The schema restricts file names to [a-z0-9-] plus an extension, so this can't leave imagesDir.
      return file && imagesDir ? path.join(imagesDir, file) : undefined;
    },
    list: () => summaries,
    size: byId.size,
  };
}

/**
 * Loads and validates every `*.json` file in `dir`. All problems across all
 * files are collected and reported together so they can be fixed in one pass.
 */
export async function loadCatalog(dir: string): Promise<SpeciesCatalog> {
  let fileNames: string[];
  try {
    fileNames = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  } catch (err) {
    throw new CatalogValidationError([`cannot read catalog directory ${dir}: ${(err as Error).message}`]);
  }

  const problems: string[] = [];
  const entries: Species[] = [];
  const seenIds = new Map<string, string>();

  for (const file of fileNames) {
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
    } catch (err) {
      problems.push(`${file}: invalid JSON: ${(err as Error).message}`);
      continue;
    }

    const parsed = speciesSchema.safeParse(raw);
    if (!parsed.success) {
      problems.push(...formatIssues(file, parsed.error));
      continue;
    }

    const species = parsed.data;
    const expectedFile = `${species.id}.json`;
    if (file !== expectedFile) {
      problems.push(`${file}: file name must match its id (expected "${expectedFile}")`);
    }
    const duplicateOf = seenIds.get(species.id);
    if (duplicateOf) {
      problems.push(`${file}: duplicate species id "${species.id}" (also in ${duplicateOf})`);
      continue;
    }
    if (species.image) {
      const imageFile = path.join(dir, 'images', species.image.file);
      const found = await fs.access(imageFile).then(
        () => true,
        () => false,
      );
      if (!found) problems.push(`${file}: image.file: "${species.image.file}" not found in images/`);
    }
    seenIds.set(species.id, file);
    entries.push(species);
  }

  if (problems.length > 0) throw new CatalogValidationError(problems);
  return createCatalog(entries, path.join(dir, 'images'));
}
