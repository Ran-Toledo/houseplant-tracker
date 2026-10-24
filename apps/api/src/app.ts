import path from 'node:path';
import { Hono } from 'hono';
import type { AiProvider } from './ai/provider';
import { createAiService } from './ai/service';
import { createCareGuideIndex } from './assistant/care-guides';
import { createReadModel } from './assistant/read-model';
import { createAssistantService } from './assistant/service';
import { logger } from 'hono/logger';
import type { SpeciesCatalog } from './catalog/loader';
import type { Db } from './db/client';
import { handleError, handleNotFound } from './middleware/errors';
import { createActivityRepository } from './repositories/activities';
import { createAiRequestRepository } from './repositories/ai-requests';
import { createCareGuideSectionRepository } from './repositories/care-guide-sections';
import { createCareScheduleRepository } from './repositories/care-schedules';
import { createConversationRepository } from './repositories/conversations';
import { createPushRepository } from './repositories/push';
import type { PushSender } from './push/sender';
import { createPushService } from './push/service';
import { createHealthCheckRepository } from './repositories/health-checks';
import { createPhotoRepository } from './repositories/photos';
import { createPlantRepository } from './repositories/plants';
import { createSettingsRepository } from './repositories/settings';
import { aiRoutes, healthCheckRoutes, plantHealthCheckRoutes } from './routes/ai';
import { conversationRoutes } from './routes/conversations';
import { dueRoutes, plantScheduleRoutes, scheduleRoutes } from './routes/care';
import { photoRoutes, plantPhotoRoutes } from './routes/photos';
import { pushRoutes } from './routes/push';
import { plantRoutes } from './routes/plants';
import { configRoutes, settingsRoutes } from './routes/settings';
import { speciesRoutes } from './routes/species';
import { createCareService } from './services/care';
import { createHealthCheckService } from './services/health-checks';
import { createIdentifyService } from './services/identify';
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
  /** Web Push delivery; null or omitted when no VAPID keys are configured. */
  pushSender?: PushSender | null;
  /** The app's HTTPS address for phones, shown in Settings → Notifications. */
  appUrl?: string | null;
  /** Disable request logging (tests). */
  quiet?: boolean;
  /** Clock for due dates and usage counts (tests). */
  now?: () => Date;
}

export function createApp(deps: AppDeps) {
  const plants = createPlantRepository(deps.db);
  const activities = createActivityRepository(deps.db);
  const photos = createPhotoRepository(deps.db);
  const photoStore = createPhotoStore(path.resolve(deps.photosDir));

  const settingsService = createSettingsService(createSettingsRepository(deps.db));
  const careService = createCareService({
    schedules: createCareScheduleRepository(deps.db),
    catalog: deps.catalog,
    settings: settingsService,
    now: deps.now,
  });
  const plantService = createPlantService({
    db: deps.db,
    plants,
    activities,
    catalog: deps.catalog,
    photoStore,
    care: careService,
  });
  const photoService = createPhotoService({ plants, photos, photoStore });
  const aiService = createAiService({
    provider: deps.aiProvider ?? null,
    settings: settingsService,
    requests: createAiRequestRepository(deps.db),
    now: deps.now,
  });
  const identifyService = createIdentifyService({ ai: aiService, catalog: deps.catalog, photos: photoService });
  const healthCheckRepository = createHealthCheckRepository(deps.db);
  const healthCheckService = createHealthCheckService({
    ai: aiService,
    catalog: deps.catalog,
    checks: healthCheckRepository,
    plants: plantService,
    photos: photoService,
    settings: settingsService,
    now: deps.now,
  });

  const careGuides = createCareGuideIndex({
    catalog: deps.catalog,
    sections: createCareGuideSectionRepository(deps.db),
    ai: aiService,
    now: deps.now,
  });
  const assistantService = createAssistantService({
    ai: aiService,
    conversations: createConversationRepository(deps.db),
    // The assistant's tools see only this read-only view of the data.
    data: createReadModel({
      plants: plantService,
      healthChecks: healthCheckRepository,
      catalog: deps.catalog,
      settings: settingsService,
      now: deps.now,
    }),
    guides: careGuides,
    photos: photoService,
    now: deps.now,
  });

  const pushService = createPushService({
    sender: deps.pushSender ?? null,
    repo: createPushRepository(deps.db),
    care: careService,
    plants: plantService,
    settings: settingsService,
    now: deps.now,
  });

  const app = new Hono();
  if (!deps.quiet) app.use('/api/*', logger());

  app.get('/api/health', (c) =>
    c.json({ status: 'ok', species: deps.catalog.size, time: new Date().toISOString() }),
  );
  app.route('/api/species', speciesRoutes(deps.catalog));
  app.route('/api/plants', plantPhotoRoutes(photoService, deps.maxUploadBytes));
  app.route('/api/plants', plantScheduleRoutes(careService, plantService));
  app.route('/api/plants', plantHealthCheckRoutes(healthCheckService));
  app.route('/api/plants', plantRoutes(plantService));
  app.route('/api/photos', photoRoutes(photoService));
  app.route('/api/schedules', scheduleRoutes(careService, plantService));
  app.route('/api/due', dueRoutes(careService, plantService));
  app.route('/api/ai', aiRoutes(identifyService, deps.maxUploadBytes));
  app.route('/api/health-checks', healthCheckRoutes(healthCheckService));
  app.route('/api/conversations', conversationRoutes(assistantService));
  app.route('/api/settings', settingsRoutes(settingsService));
  app.route('/api/push', pushRoutes(pushService));
  app.route('/api/config', configRoutes({ settings: settingsService, ai: aiService, pushPublicKey: pushService.publicKey, appUrl: deps.appUrl ?? null }));

  app.notFound(handleNotFound);
  app.onError(handleError);
  // The daily digest runs alongside the server and index.ts starts it (tests call `tick()` themselves);
  // index.ts also brings the care-guide embeddings up to date (searches do it on first use otherwise).
  return Object.assign(app, { push: pushService, careGuides });
}
