import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { Activity, Plant, plantCreateSchema, plantListQuerySchema, plantUpdateSchema } from '@houseplant/shared';
import type { SpeciesCatalog } from '../catalog/loader';
import type { Db } from '../db/client';
import { ApiError, notFound } from '../middleware/errors';
import type { ActivityRepository } from '../repositories/activities';
import type { PlantChanges, PlantRepository } from '../repositories/plants';
import type { PhotoStore } from '../storage/photo-store';
import type { ActivityRow } from '../db/schema';

type CreateInput = z.output<typeof plantCreateSchema>;
type UpdateInput = z.output<typeof plantUpdateSchema>;
type ListQuery = z.output<typeof plantListQuerySchema>;
type ActivityInput = Pick<ActivityRow, 'activityType' | 'performedAt'> & { notes?: string | null };

interface Deps {
  db: Db;
  plants: PlantRepository;
  activities: ActivityRepository;
  catalog: SpeciesCatalog;
  photoStore: PhotoStore;
}

export function createPlantService({ db, plants, activities, catalog, photoStore }: Deps) {
  function assertKnownSpecies(speciesId: string | null | undefined) {
    if (speciesId && !catalog.has(speciesId)) {
      throw new ApiError(400, 'unknown_species', `Species "${speciesId}" is not in the catalog`, [
        { path: 'speciesId', message: 'unknown species' },
      ]);
    }
  }

  /** Catalog species whose names (in any language) or scientific name contain `text`. */
  function speciesMatching(text: string): string[] {
    const needle = text.toLocaleLowerCase();
    return catalog
      .list()
      .filter((s) =>
        [s.scientificName, ...Object.values(s.names).flatMap((n) => [n.commonName, ...n.alternateNames])].some((name) =>
          name.toLocaleLowerCase().includes(needle),
        ),
      )
      .map((s) => s.id);
  }

  function activityRows(plantId: string, inputs: ActivityInput[], now: string): ActivityRow[] {
    return inputs.map((a) => ({
      id: randomUUID(),
      plantId,
      activityType: a.activityType,
      performedAt: a.performedAt,
      notes: a.notes ?? null,
      createdAt: now,
    }));
  }

  return {
    list(query: ListQuery): Plant[] {
      return plants.list({ ...query, speciesIds: query.q ? speciesMatching(query.q) : undefined });
    },

    locations(): string[] {
      return plants.locations();
    },

    get(id: string): Plant {
      const plant = plants.get(id);
      if (!plant) throw notFound('Plant');
      return plant;
    },

    create(input: CreateInput): Plant {
      assertKnownSpecies(input.speciesId);
      const { initialActivities = [], ...fields } = input;
      const id = randomUUID();
      const now = new Date().toISOString();
      db.transaction(() => {
        plants.insert(
          id,
          {
            speciesId: fields.speciesId ?? null,
            nickname: fields.nickname,
            customSpeciesName: fields.customSpeciesName ?? null,
            location: fields.location ?? null,
            lightExposure: fields.lightExposure ?? null,
            windowOrientation: fields.windowOrientation ?? null,
            acquiredAt: fields.acquiredAt ?? null,
            potDiameterCm: fields.potDiameterCm ?? null,
            potMaterial: fields.potMaterial ?? null,
            hasDrainage: fields.hasDrainage ?? null,
            soilDescription: fields.soilDescription ?? null,
            condition: fields.condition ?? 'unknown',
            notes: fields.notes ?? null,
          },
          now,
        );
        activities.insert(activityRows(id, initialActivities, now));
      });
      return plants.get(id)!;
    },

    update(id: string, input: UpdateInput): Plant {
      assertKnownSpecies(input.speciesId);
      // Drop keys that were omitted; explicit nulls clear the field.
      const changes = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as PlantChanges;
      if (!plants.update(id, changes, new Date().toISOString())) throw notFound('Plant');
      return plants.get(id)!;
    },

    /** Deletes the plant, its activities and photo records (via FK cascade), then its photo files. */
    async delete(id: string): Promise<void> {
      if (!plants.delete(id)) throw notFound('Plant');
      try {
        await photoStore.removePlantDir(id);
      } catch (err) {
        // The records are gone; leftover files are harmless and are logged for manual cleanup.
        console.error(`[api] could not remove photo files for deleted plant ${id}`, err);
      }
    },

    listActivities(plantId: string): Activity[] {
      if (!plants.exists(plantId)) throw notFound('Plant');
      return activities.listForPlant(plantId);
    },

    addActivity(plantId: string, input: ActivityInput): Activity {
      if (!plants.exists(plantId)) throw notFound('Plant');
      const [row] = activityRows(plantId, [input], new Date().toISOString());
      activities.insert([row!]);
      return row!;
    },

    deleteActivity(plantId: string, activityId: string): void {
      if (!activities.delete(plantId, activityId)) throw notFound('Activity');
    },
  };
}

export type PlantService = ReturnType<typeof createPlantService>;
