import { z } from 'zod';
import { dateSchema } from './plants';

/**
 * App-wide settings the server needs (stored in SQLite). The UI language is
 * not one of them: it stays in the browser.
 */

export const HEMISPHERES = ['north', 'south'] as const;
export type Hemisphere = (typeof HEMISPHERES)[number];

/** IANA time zone name, e.g. `Asia/Jerusalem`. */
const timeZoneSchema = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'must be an IANA time zone such as "Asia/Jerusalem"' },
);

export const appSettingsSchema = z.strictObject({
  /** Used for due dates, the daily notification time and seasons. */
  timezone: timeZoneSchema,
  /** Shifts the species' growing months for the southern hemisphere. */
  hemisphere: z.enum(HEMISPHERES),
  /** Owner switch for AI features, on top of an API key being configured. */
  aiEnabled: z.boolean(),
  /** Maximum AI requests per calendar month (in `timezone`); 0 blocks AI requests. */
  aiMonthlyRequestLimit: z.number().int().min(0).max(100_000),
  /** Local time of the daily reminder digest, `HH:MM`. */
  notificationTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a time in HH:MM format'),
  /** No reminders are sent until after this date (a vacation pause), or null. */
  notificationsPausedUntil: dateSchema.nullable(),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = {
  timezone: 'Asia/Jerusalem',
  hemisphere: 'north',
  aiEnabled: true,
  aiMonthlyRequestLimit: 300,
  notificationTime: '08:30',
  notificationsPausedUntil: null,
};

export const appSettingsUpdateSchema = appSettingsSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'at least one setting must be provided' });
export type AppSettingsUpdate = z.input<typeof appSettingsUpdateSchema>;

/** What the client needs to show or hide features: `GET /api/config`. */
export interface AppConfig {
  ai: {
    /** An API key is configured on the server. */
    configured: boolean;
    /** The owner's switch (`aiEnabled`). */
    enabled: boolean;
    /** Configured, enabled and under the monthly limit: AI actions can be offered. */
    available: boolean;
    /** Model used for AI requests, or null when not configured. */
    model: string | null;
    usedThisMonth: number;
    monthlyLimit: number;
  };
  push: {
    available: boolean;
    vapidPublicKey: string | null;
  };
  timezone: string;
}
