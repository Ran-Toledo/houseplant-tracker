import { Hono } from 'hono';
import { appSettingsUpdateSchema, type AppConfig } from '@houseplant/shared';
import type { AiService } from '../ai/service';
import { jsonBodyLimit, readJson, validate } from '../middleware/errors';
import type { SettingsService } from '../services/settings';

/** App-wide settings, mounted under `/api/settings`. */
export function settingsRoutes(service: SettingsService) {
  return new Hono()
    .get('/', (c) => c.json({ settings: service.get() }))
    .patch('/', jsonBodyLimit, async (c) => {
      const changes = validate(appSettingsUpdateSchema, await readJson(c));
      return c.json({ settings: service.update(changes) });
    });
}

/** What the client needs to know to show or hide features, mounted at `/api/config`. */
export function configRoutes(deps: { settings: SettingsService; ai: AiService }) {
  return new Hono().get('/', (c) => {
    const config: AppConfig = {
      ai: deps.ai.status(),
      // Web Push arrives with the reminders phase.
      push: { available: false, vapidPublicKey: null },
      timezone: deps.settings.get().timezone,
    };
    return c.json({ config });
  });
}
