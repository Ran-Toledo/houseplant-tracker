import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import type { SpeciesCatalog } from '../catalog/loader';
import { notFound } from '../middleware/errors';

const IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * Read-only species endpoints. Responses are bilingual (both `en` and `he`);
 * the client picks the localization for the active UI language.
 */
export function speciesRoutes(catalog: SpeciesCatalog) {
  return new Hono()
    .get('/', (c) => c.json({ species: catalog.list() }))
    .get('/:id', (c) => {
      const species = catalog.get(c.req.param('id'));
      if (!species) throw notFound('Species');
      return c.json({ species });
    })
    .get('/:id/image', async (c) => {
      const file = catalog.imagePath(c.req.param('id'));
      if (!file) throw notFound('Species image');
      const data = await fs.readFile(file).catch(() => {
        throw notFound('Species image');
      });
      return c.body(new Uint8Array(data), 200, {
        'Content-Type': IMAGE_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        // Catalog images change rarely (only with a catalog update + restart).
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      });
    });
}
