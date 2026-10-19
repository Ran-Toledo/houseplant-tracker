import path from 'node:path';
import { Hono } from 'hono';
import type { AiProvider } from './ai/provider';
import { createAiService } from './ai/service';
import { logger } from 'hono/logger';
import type { SpeciesCatalog } from './catalog/loader';
import type { Db } from './db/client';
import { handleError, handleNotFound } from './middleware/errors';
import { createActivityRepository } from './repositories/activities';
import { createAiRequestRepository } from './repositories/ai-requests';
import { createPhotoRepository } from './repositories/photos';
import { createPlantRepository } from './repositories/plants';
import { createSettingsRepository } from './repositories/settings';
import { photoRoutes, plantPhotoRoutes } from './routes/photos';
import { plantRoutes } from './routes/plants';
import { configRoutes, settingsRoutes } from './routes/settings';
import { speciesRoutes } from './routes/species';
import { createPhotoService } from './services/photos';
import { createPlantService } from './services/plants';
import { createSettingsService } from './services/settings';
import { createPhotoStore } from './storage/photo-store';

export interface AppDeps {
  catalog: SpeciesCatalog;
  db: Db;
  /** Directory for uploaded photo files. */
  photosDir: string;
  maxUploadBytes: number;
  /** Model provider for AI features; null or omitted when no API key is configured. */
  aiProvider?: AiProvider | null;
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
  const settingsService = createSettingsService(createSettingsRepository(deps.db));
  const aiService = createAiService({
    provider: deps.aiProvider ?? null,
    settings: settingsService,
    requests: createAiRequestRepository(deps.db),
  });

  const app = new Hono();
  if (!deps.quiet) app.use('/api/*', logger());

  app.get('/api/health', (c) =>
    c.json({ status: 'ok', species: deps.catalog.size, time: new Date().toISOString() }),
  );
  app.route('/api/species', speciesRoutes(deps.catalog));
  app.route('/api/plants', plantPhotoRoutes(photoService, deps.maxUploadBytes));
  app.route('/api/plants', plantRoutes(plantService));
  app.route('/api/photos', photoRoutes(photoService));
  app.route('/api/settings', settingsRoutes(settingsService));
  app.route('/api/config', configRoutes({ settings: settingsService, ai: aiService }));

  app.notFound(handleNotFound);
  app.onError(handleError);
  return app;
}
