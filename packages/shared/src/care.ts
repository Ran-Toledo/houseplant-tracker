import { z } from 'zod';
import type { ActivityType, Photo } from './plants';

/**
 * Care schedules (reminders). A schedule says *how often to check*; the due
 * date is always derived from the activity log, so logging "Watered today"
 * clears a reminder without any extra bookkeeping.
 */

export const SCHEDULE_MODES = ['fixed', 'adaptive'] as const;
export type ScheduleMode = (typeof SCHEDULE_MODES)[number];

/** Activity types that can have a schedule. Watering first; others can follow with the same machinery. */
export const SCHEDULED_ACTIVITY_TYPES = ['watering'] as const;
export type ScheduledActivityType = (typeof SCHEDULED_ACTIVITY_TYPES)[number] & ActivityType;

export const DUE_STATUSES = ['overdue', 'today', 'soon', 'later'] as const;
export type DueStatus = (typeof DUE_STATUSES)[number];

/** Where an interval came from, so the UI can explain it. */
export const INTERVAL_BASES = ['fixed', 'history', 'species', 'default'] as const;
export type IntervalBasis = (typeof INTERVAL_BASES)[number];

export const careScheduleInputSchema = z
  .strictObject({
    enabled: z.boolean(),
    mode: z.enum(SCHEDULE_MODES),
    /** Days between checks; required for `fixed`, ignored for `adaptive`. */
    intervalDays: z.number().int().min(1, 'must be at least 1 day').max(90, 'must be at most 90 days').nullable().optional(),
  })
  .refine((v) => v.mode !== 'fixed' || (v.intervalDays !== null && v.intervalDays !== undefined), {
    message: 'is required for a fixed schedule',
    path: ['intervalDays'],
  });
export type CareScheduleInput = z.input<typeof careScheduleInputSchema>;

export const snoozeInputSchema = z.strictObject({
  days: z.number().int().min(1, 'must be at least 1 day').max(14, 'must be at most 14 days'),
});

export const dueQuerySchema = z.strictObject({
  /** Include items due within this many days from today (overdue items are always included). */
  days: z.coerce.number().int().min(0).max(30).optional(),
});

/** When the next check is due, in the owner's time zone. */
export interface DueInfo {
  /** Local calendar date, `YYYY-MM-DD`. */
  dueOn: string;
  /** Days from today; negative when overdue. */
  daysUntil: number;
  status: DueStatus;
  /** Days between checks used for this due date. */
  intervalDays: number;
  basis: IntervalBasis;
  /** Number of logged waterings the interval is based on (`history` only; otherwise 0). */
  basedOnWaterings: number;
  snoozedUntil: string | null;
}

export interface CareSchedule {
  id: string;
  plantId: string;
  activityType: ScheduledActivityType;
  mode: ScheduleMode;
  /** The configured interval for `fixed`; null for `adaptive`. */
  intervalDays: number | null;
  enabled: boolean;
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  /** Null when the schedule is turned off. */
  due: DueInfo | null;
}

/** One entry of `GET /api/due`: a plant that needs a check soon. */
export interface DueItem {
  plantId: string;
  nickname: string;
  speciesId: string | null;
  customSpeciesName: string | null;
  location: string | null;
  coverPhoto: Photo | null;
  scheduleId: string;
  activityType: ScheduledActivityType;
  due: DueInfo;
}
