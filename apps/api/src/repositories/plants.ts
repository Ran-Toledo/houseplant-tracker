import { and, desc, eq, inArray, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import type { ActivityType, Plant } from '@houseplant/shared';
import type { Db } from '../db/client';
import { activities, photos, plants, type PhotoRow, type PlantRow } from '../db/schema';
import { toPhotoDto } from './photos';

/** A plant as stored, before computed fields (like the next watering check) are added. */
export type PlantRecord = Omit<Plant, 'wateringDue'>;

export type NewPlant = Omit<PlantRow, 'id' | 'createdAt' | 'updatedAt'>;
export type PlantChanges = Partial<NewPlant>;

export interface PlantFilter {
  /** Free-text search over nickname, custom species name, location and notes. */
  q?: string;
  /** Plants whose catalog species matched the search text (resolved by the caller). */
  speciesIds?: string[];
  location?: string;
  condition?: PlantRow['condition'];
}

/** Latest `performed_at` of a given activity type, derived on read so it can never go stale. */
const latestActivity = (type: ActivityType) =>
  sql<string | null>`(select max(${activities.performedAt}) from ${activities}
    where ${activities.plantId} = ${plants.id} and ${activities.activityType} = ${type})`;

/** Escapes LIKE wildcards so user input is matched literally. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
const likeEscaped = (column: SQLWrapper, text: string) =>
  sql`${column} like ${likePattern(text)} escape '\\'`;

function toPlantDto(row: {
  plant: PlantRow;
  lastWateredAt: string | null;
  lastRepottedAt: string | null;
  cover: PhotoRow | null;
}): PlantRecord {
  return {
    ...row.plant,
    lastWateredAt: row.lastWateredAt,
    lastRepottedAt: row.lastRepottedAt,
    coverPhoto: row.cover ? toPhotoDto(row.cover) : null,
  };
}

export function createPlantRepository(db: Db) {
  const baseQuery = () =>
    db
      .select({
        plant: plants,
        lastWateredAt: latestActivity('watering'),
        lastRepottedAt: latestActivity('repotting'),
        cover: photos,
      })
      .from(plants)
      .leftJoin(photos, and(eq(photos.plantId, plants.id), eq(photos.isCover, true)));

  return {
    list(filter: PlantFilter = {}): PlantRecord[] {
      const conditions: SQL[] = [];
      if (filter.q) {
        const textMatches = [
          likeEscaped(plants.nickname, filter.q),
          likeEscaped(plants.customSpeciesName, filter.q),
          likeEscaped(plants.location, filter.q),
          likeEscaped(plants.notes, filter.q),
        ];
        if (filter.speciesIds?.length) textMatches.push(inArray(plants.speciesId, filter.speciesIds));
        conditions.push(or(...textMatches)!);
      }
      if (filter.location) conditions.push(sql`${plants.location} = ${filter.location} collate nocase`);
      if (filter.condition) conditions.push(eq(plants.condition, filter.condition));

      return baseQuery()
        .where(and(...conditions))
        .orderBy(desc(plants.createdAt), desc(plants.id))
        .all()
        .map(toPlantDto);
    },

    get(id: string): PlantRecord | undefined {
      const row = baseQuery().where(eq(plants.id, id)).get();
      return row ? toPlantDto(row) : undefined;
    },

    exists(id: string): boolean {
      return db.select({ id: plants.id }).from(plants).where(eq(plants.id, id)).get() !== undefined;
    },

    insert(id: string, values: NewPlant, now: string): void {
      db.insert(plants)
        .values({ ...values, id, createdAt: now, updatedAt: now })
        .run();
    },

    update(id: string, changes: PlantChanges, now: string): boolean {
      const result = db
        .update(plants)
        .set({ ...changes, updatedAt: now })
        .where(eq(plants.id, id))
        .run();
      return result.changes > 0;
    },

    /** Deletes the plant; activities and photo rows cascade via foreign keys. */
    delete(id: string): boolean {
      return db.delete(plants).where(eq(plants.id, id)).run().changes > 0;
    },

    /** Distinct non-empty locations, for the filter UI. */
    locations(): string[] {
      return db
        .selectDistinct({ location: plants.location })
        .from(plants)
        .where(sql`${plants.location} is not null`)
        .orderBy(plants.location)
        .all()
        .map((r) => r.location!);
    },
  };
}

export type PlantRepository = ReturnType<typeof createPlantRepository>;
