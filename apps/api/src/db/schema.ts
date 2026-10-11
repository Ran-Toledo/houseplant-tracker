import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import {
  ACTIVITY_TYPES,
  CONDITIONS,
  LIGHT_EXPOSURES,
  POT_MATERIALS,
  WINDOW_ORIENTATIONS,
} from '@houseplant/shared';

/*
 * Storage conventions:
 * - ids: random UUID strings
 * - timestamps: ISO 8601 UTC strings (`2026-10-11T09:30:00.000Z`), which sort lexically
 * - calendar dates: `YYYY-MM-DD` strings
 * - booleans: INTEGER 0/1
 */

const timestamps = {
  createdAt: text('created_at').notNull(),
};

export const plants = sqliteTable(
  'plants',
  {
    id: text('id').primaryKey(),
    /** Id of a species JSON file. Not a foreign key: the catalog lives outside SQLite. */
    speciesId: text('species_id'),
    nickname: text('nickname').notNull(),
    customSpeciesName: text('custom_species_name'),
    location: text('location'),
    lightExposure: text('light_exposure', { enum: LIGHT_EXPOSURES }),
    windowOrientation: text('window_orientation', { enum: WINDOW_ORIENTATIONS }),
    acquiredAt: text('acquired_at'),
    potDiameterCm: real('pot_diameter_cm'),
    potMaterial: text('pot_material', { enum: POT_MATERIALS }),
    hasDrainage: integer('has_drainage', { mode: 'boolean' }),
    soilDescription: text('soil_description'),
    condition: text('condition', { enum: CONDITIONS }).notNull().default('unknown'),
    notes: text('notes'),
    ...timestamps,
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('plants_species_idx').on(t.speciesId)],
);

export const activities = sqliteTable(
  'activities',
  {
    id: text('id').primaryKey(),
    plantId: text('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    activityType: text('activity_type', { enum: ACTIVITY_TYPES }).notNull(),
    performedAt: text('performed_at').notNull(),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('activities_plant_type_time_idx').on(t.plantId, t.activityType, t.performedAt)],
);

export const photos = sqliteTable(
  'photos',
  {
    id: text('id').primaryKey(),
    plantId: text('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    /** Path relative to the photos directory, e.g. `<plantId>/<photoId>.jpg`. */
    storageKey: text('storage_key').notNull().unique(),
    isCover: integer('is_cover', { mode: 'boolean' }).notNull().default(false),
    capturedAt: text('captured_at'),
    ...timestamps,
  },
  (t) => [
    index('photos_plant_idx').on(t.plantId),
    // At most one cover photo per plant.
    uniqueIndex('photos_one_cover_per_plant').on(t.plantId).where(sql`${t.isCover} = 1`),
  ],
);

export type PlantRow = typeof plants.$inferSelect;
export type ActivityRow = typeof activities.$inferSelect;
export type PhotoRow = typeof photos.$inferSelect;
