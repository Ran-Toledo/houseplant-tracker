import type { Activity, HealthCheck, Plant, Species, SpeciesSummary } from '@houseplant/shared';
import type { SpeciesCatalog } from '../catalog/loader';
import { careSignals, type CareSignal } from '../care/signals';
import { localDate, localParts } from '../lib/zoned-time';
import { ApiError } from '../middleware/errors';
import type { HealthCheckRepository } from '../repositories/health-checks';
import type { PlantService } from '../services/plants';
import type { SettingsService } from '../services/settings';

interface Deps {
  /** Only the reading methods are accepted, so the assistant can't reach a write. */
  plants: Pick<PlantService, 'list' | 'get' | 'listActivities'>;
  healthChecks: Pick<HealthCheckRepository, 'listForPlant'>;
  catalog: SpeciesCatalog;
  settings: Pick<SettingsService, 'get'>;
  now?: () => Date;
}

/**
 * Everything the assistant may know, as read-only functions. Its tools get
 * this object and nothing else: no repositories, no services with writes.
 */
export function createReadModel({ plants, healthChecks, catalog, settings, now = () => new Date() }: Deps) {
  /** Returns null for unknown plants instead of throwing, so a tool can say "not found". */
  function plant(id: string): Plant | null {
    try {
      return plants.get(id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  const readModel = {
    today(): string {
      return localDate(now(), settings.get().timezone);
    },

    /** Converts a timestamp to the owner's local date. */
    localDate(timestamp: string): string {
      return localDate(new Date(timestamp), settings.get().timezone);
    },

    listPlants(): Plant[] {
      return plants.list({});
    },

    plant,

    activities(plantId: string): Activity[] {
      return plant(plantId) ? plants.listActivities(plantId) : [];
    },

    healthChecks(plantId: string): HealthCheck[] {
      return plant(plantId) ? healthChecks.listForPlant(plantId) : [];
    },

    careSignals(plantId: string): CareSignal[] | null {
      const p = plant(plantId);
      if (!p) return null;
      const { timezone, hemisphere } = settings.get();
      return careSignals({
        plant: p,
        profile: p.speciesId ? catalog.get(p.speciesId)?.careProfile : null,
        activities: plants.listActivities(p.id),
        latestHealthCheck: healthChecks.listForPlant(p.id)[0] ?? null,
        today: readModel.today(),
        localDate: readModel.localDate,
        month: localParts(now(), timezone).month,
        hemisphere,
      });
    },

    species(id: string): Species | undefined {
      return catalog.get(id);
    },

    speciesList(): SpeciesSummary[] {
      return catalog.list();
    },
  };
  return Object.freeze(readModel);
}

export type ReadModel = ReturnType<typeof createReadModel>;
