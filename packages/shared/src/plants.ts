import { z } from 'zod';
import type { DueInfo } from './care';
import { speciesIdSchema } from './species';

/**
 * Personal plant records (stored in SQLite). Enumerated values are stable
 * identifiers; the UI translates them for display.
 */

export const CONDITIONS = ['healthy', 'needs-attention', 'unhealthy', 'unknown'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const LIGHT_EXPOSURES = ['direct', 'bright-indirect', 'medium', 'low'] as const;
export type LightExposure = (typeof LIGHT_EXPOSURES)[number];

export const WINDOW_ORIENTATIONS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
] as const;
export type WindowOrientation = (typeof WINDOW_ORIENTATIONS)[number];

export const POT_MATERIALS = [
  'plastic',
  'terracotta',
  'ceramic',
  'concrete',
  'metal',
  'glass',
  'fabric',
  'other',
] as const;
export type PotMaterial = (typeof POT_MATERIALS)[number];

export const ACTIVITY_TYPES = ['watering', 'fertilizing', 'repotting', 'pruning', 'treatment'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Trimmed optional text; empty strings become null so the UI can send blank fields. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `must be at most ${max} characters`)
    .transform((s) => (s === '' ? null : s))
    .nullable()
    .optional();

/** Calendar date, `YYYY-MM-DD`. */
export const dateSchema = z.iso.date('must be a date in YYYY-MM-DD format');
/** ISO 8601 timestamp with a timezone offset; normalized to UTC. */
export const timestampSchema = z.iso
  .datetime({ offset: true, message: 'must be an ISO 8601 timestamp' })
  .transform((s) => new Date(s).toISOString());

const plantFields = {
  nickname: z.string().trim().min(1, 'is required').max(100, 'must be at most 100 characters'),
  speciesId: speciesIdSchema.nullable().optional(),
  customSpeciesName: optionalText(100),
  location: optionalText(100),
  lightExposure: z.enum(LIGHT_EXPOSURES).nullable().optional(),
  windowOrientation: z.enum(WINDOW_ORIENTATIONS).nullable().optional(),
  acquiredAt: dateSchema.nullable().optional(),
  potDiameterCm: z.number().positive('must be greater than 0').max(500).nullable().optional(),
  potMaterial: z.enum(POT_MATERIALS).nullable().optional(),
  hasDrainage: z.boolean().nullable().optional(),
  soilDescription: optionalText(500),
  condition: z.enum(CONDITIONS).optional(),
  notes: optionalText(5000),
};

export const activityInputSchema = z.strictObject({
  activityType: z.enum(ACTIVITY_TYPES),
  performedAt: timestampSchema,
  notes: optionalText(1000),
});
export type ActivityInput = z.input<typeof activityInputSchema>;

export const plantCreateSchema = z.strictObject({
  ...plantFields,
  /** Known past care events (e.g. last watering) to record with the new plant. */
  initialActivities: z.array(activityInputSchema).max(20).optional(),
});
export type PlantCreateInput = z.input<typeof plantCreateSchema>;

export const plantUpdateSchema = z
  .strictObject(plantFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'at least one field must be provided' });
export type PlantUpdateInput = z.input<typeof plantUpdateSchema>;

export const plantListQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  location: z.string().trim().max(100).optional(),
  condition: z.enum(CONDITIONS).optional(),
});

export interface Photo {
  id: string;
  plantId: string;
  /** URL path serving the image file. */
  url: string;
  /** URL path serving a small preview (longest edge 512 px), for cards and tiles. */
  thumbnailUrl: string;
  isCover: boolean;
  capturedAt: string | null;
  createdAt: string;
}

export interface Activity {
  id: string;
  plantId: string;
  activityType: ActivityType;
  performedAt: string;
  notes: string | null;
  createdAt: string;
}

export interface Plant {
  id: string;
  speciesId: string | null;
  nickname: string;
  customSpeciesName: string | null;
  location: string | null;
  lightExposure: LightExposure | null;
  windowOrientation: WindowOrientation | null;
  acquiredAt: string | null;
  potDiameterCm: number | null;
  potMaterial: PotMaterial | null;
  hasDrainage: boolean | null;
  soilDescription: string | null;
  condition: Condition;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Derived from the latest `watering` activity. */
  lastWateredAt: string | null;
  /** Derived from the latest `repotting` activity. */
  lastRepottedAt: string | null;
  coverPhoto: Photo | null;
  /** Next watering check, when the plant has a watering reminder turned on. */
  wateringDue: DueInfo | null;
}

/** Error body returned by every failing API request. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
