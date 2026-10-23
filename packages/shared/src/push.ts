import { z } from 'zod';
import { LANGUAGES, type Language } from './species';

/**
 * Web Push: devices that receive the daily care digest. A device subscribes
 * from Settings → Notifications in the installed app (HTTPS only).
 */

export const pushSubscriptionInputSchema = z.strictObject({
  /** The push service URL the browser returned (for iPhones, Apple's push service). */
  endpoint: z.url({ protocol: /^https$/ }).max(2000),
  keys: z.strictObject({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
  /** The UI language; notifications to this device are written in it. */
  lang: z.enum(LANGUAGES),
  userAgent: z.string().max(500).nullable().optional(),
});
export type PushSubscriptionInput = z.input<typeof pushSubscriptionInputSchema>;

export interface PushDevice {
  id: string;
  /** Lets a browser recognize its own subscription. */
  endpoint: string;
  lang: Language;
  userAgent: string | null;
  createdAt: string;
  lastSuccessAt: string | null;
}

export const DIGEST_STATUSES = ['sent', 'failed', 'skipped'] as const;
export type DigestStatus = (typeof DIGEST_STATUSES)[number];

/** The latest daily digest, for "Last sent" in Settings. */
export interface DigestInfo {
  /** Local date the digest was for, `YYYY-MM-DD`. */
  digestDate: string;
  status: DigestStatus;
  plantCount: number;
  sentAt: string;
}

/** What the service worker receives in a push message. */
export interface PushPayload {
  title: string;
  body: string;
  /** Page to open when the notification is tapped. */
  url: string;
  /** Number for the Home Screen app badge, where supported. */
  badge: number;
  /** Replaces an earlier notification with the same tag. */
  tag: string;
}
