import { appSettingsSchema, DEFAULT_SETTINGS, type AppSettings, type appSettingsUpdateSchema } from '@houseplant/shared';
import type { z } from 'zod';
import type { SettingsRepository } from '../repositories/settings';

type UpdateInput = z.output<typeof appSettingsUpdateSchema>;

export function createSettingsService(repo: SettingsRepository) {
  return {
    /** Stored values over the defaults. A stored value that no longer validates falls back to its default. */
    get(): AppSettings {
      const stored = repo.all();
      const merged = { ...DEFAULT_SETTINGS };
      for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
        if (!(key in stored)) continue;
        const field = appSettingsSchema.shape[key].safeParse(stored[key]);
        if (field.success) Object.assign(merged, { [key]: field.data });
      }
      return merged;
    },

    update(changes: UpdateInput): AppSettings {
      repo.setMany(changes, new Date().toISOString());
      return this.get();
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
