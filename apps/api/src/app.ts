import path from 'node:path';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { SpeciesCatalog } from './catalog/loader';
import type { Db } from './db/client';
import { handleError, handleNotFound } from './middleware/errors';
import { createActivityRepository } from './repositories/activities';
import { createPhotoRepository } from './repositories/photos';
import { createPlantRepository } from './repositories/plants';
import { photoRoutes, plantPhotoRoutes } from './routes/photos';
import { plantRoutes } from './routes/plants';
import { speciesRoutes } from './routes/species';
import { createPhotoService } from './services/photos';
import { createPlantService } from './services/plants';
import { createPhotoStore } from './storage/photo-store';

export interface AppDeps {
  catalog: SpeciesCatalog;
  db: Db;
  /** Directory for uploaded photo files. */
  photosDir: string;
  maxUploadBytes: number;
  /** Disable request logging (tests). */
  quiet?: boolean;
}

export function createApp(deps: AppDeps) {
  const plants = createPlantRepository(deps.db);
  const activities = createActivityRepository(deps.db);
  const photos = createPhotoRepository(deps.db);
  const photoStore = createPhotoStore(path.resolve(deps.photosDir));

  const plantService = createPlantService({ db: deps.db, plants, activities, catalog: deps.catalog, photoStore });
  const photoService = createPhotoService({ plants, photos, photoStore });

  const app = new Hono();
  if (!deps.quiet) app.use('/api/*', logger());

  app.get('/api/health', (c) =>
    c.json({ status: 'ok', species: deps.catalog.size, time: new Date().toISOString() }),
  );
  app.route('/api/species', speciesRoutes(deps.catalog));
  app.route('/api/plants', plantPhotoRoutes(photoService, deps.maxUploadBytes));
  app.route('/api/plants', plantRoutes(plantService));
  app.route('/api/photos', photoRoutes(photoService));

  app.notFound(handleNotFound);
  app.onError(handleError);
  return app;
}
