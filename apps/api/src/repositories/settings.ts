import type { Db } from '../db/client';
import { settings } from '../db/schema';

/** Raw key/value access; the settings service owns defaults and validation. */
export function createSettingsRepository(db: Db) {
  return {
    all(): Record<string, unknown> {
      const rows = db.select().from(settings).all();
      return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value) as unknown]));
    },

    setMany(values: Record<string, unknown>, now: string): void {
      db.transaction((tx) => {
        for (const [key, value] of Object.entries(values)) {
          const row = { key, value: JSON.stringify(value), updatedAt: now };
          tx.insert(settings)
            .values(row)
            .onConflictDoUpdate({ target: settings.key, set: { value: row.value, updatedAt: now } })
            .run();
        }
      });
    },
  };
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;
