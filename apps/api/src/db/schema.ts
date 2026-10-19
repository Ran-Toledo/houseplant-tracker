import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import {
  ACTIVITY_TYPES,
  AI_CONFIDENCES,
  ASSESSED_CONDITIONS,
  CONDITIONS,
  LIGHT_EXPOSURES,
  POT_MATERIALS,
  SCHEDULE_MODES,
  SCHEDULED_ACTIVITY_TYPES,
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

/** App-wide settings, one row per key; `value` is JSON. Missing keys fall back to defaults. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const AI_REQUEST_KINDS = ['identify', 'health', 'chat', 'check'] as const;
export const AI_REQUEST_STATUSES = ['ok', 'invalid-output', 'refused', 'error', 'timeout'] as const;

/** One row per model call, for usage stats, the monthly limit and debugging. */
export const aiRequests = sqliteTable(
  'ai_requests',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: AI_REQUEST_KINDS }).notNull(),
    plantId: text('plant_id').references(() => plants.id, { onDelete: 'set null' }),
    photoId: text('photo_id').references(() => photos.id, { onDelete: 'set null' }),
    model: text('model').notNull(),
    status: text('status', { enum: AI_REQUEST_STATUSES }).notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms'),
    errorCode: text('error_code'),
    /** The validated output, as JSON (only for status `ok`). */
    resultJson: text('result_json'),
    ...timestamps,
  },
  (t) => [index('ai_requests_created_idx').on(t.createdAt), index('ai_requests_plant_idx').on(t.plantId)],
);

/**
 * How often to check a plant (watering for now). Due dates are derived from the
 * activity log, never stored; `snoozed_until` only postpones the current reminder.
 */
export const careSchedules = sqliteTable(
  'care_schedules',
  {
    id: text('id').primaryKey(),
    plantId: text('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    activityType: text('activity_type', { enum: SCHEDULED_ACTIVITY_TYPES }).notNull(),
    mode: text('mode', { enum: SCHEDULE_MODES }).notNull(),
    /** Required for `fixed`; null for `adaptive`. */
    intervalDays: integer('interval_days'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    /** Local date (`YYYY-MM-DD`); the reminder isn't due before it. Cleared when the activity is logged. */
    snoozedUntil: text('snoozed_until'),
    ...timestamps,
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [uniqueIndex('care_schedules_plant_type_idx').on(t.plantId, t.activityType)],
);

/** AI health assessments of a plant photo, kept as a history. */
export const healthChecks = sqliteTable(
  'health_checks',
  {
    id: text('id').primaryKey(),
    plantId: text('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    photoId: text('photo_id').references(() => photos.id, { onDelete: 'set null' }),
    aiRequestId: text('ai_request_id')
      .notNull()
      .references(() => aiRequests.id),
    condition: text('condition', { enum: ASSESSED_CONDITIONS }).notNull(),
    confidence: text('confidence', { enum: AI_CONFIDENCES }).notNull(),
    /** The validated `healthAssessmentSchema` answer, as JSON. */
    assessmentJson: text('assessment_json').notNull(),
    /** When the condition was applied to the plant; null until then. */
    appliedAt: text('applied_at'),
    ...timestamps,
  },
  (t) => [index('health_checks_plant_time_idx').on(t.plantId, t.createdAt)],
);

export type PlantRow = typeof plants.$inferSelect;
export type ActivityRow = typeof activities.$inferSelect;
export type PhotoRow = typeof photos.$inferSelect;
export type AiRequestRow = typeof aiRequests.$inferSelect;
export type CareScheduleRow = typeof careSchedules.$inferSelect;
export type HealthCheckRow = typeof healthChecks.$inferSelect;
