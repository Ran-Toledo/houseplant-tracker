import webpush, { WebPushError } from 'web-push';
import type { PushPayload } from '@houseplant/shared';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type SendResult =
  | { ok: true }
  /** `gone`: the push service says the subscription no longer exists (404/410), so it should be deleted. */
  | { ok: false; gone: boolean; message: string };

/** Delivers one push message. Replaced by a stub in tests. */
export interface PushSender {
  /** Public VAPID key the browser subscribes with. */
  readonly publicKey: string;
  send(target: PushTarget, payload: PushPayload): Promise<SendResult>;
}

/** Push messages expire after a day: an old care digest isn't worth delivering. */
const TTL_SECONDS = 24 * 60 * 60;

export function createWebPushSender(vapid: { publicKey: string; privateKey: string; subject: string }): PushSender {
  return {
    publicKey: vapid.publicKey,
    async send(target, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(payload),
          { vapidDetails: vapid, TTL: TTL_SECONDS, urgency: 'normal' },
        );
        return { ok: true };
      } catch (err) {
        if (err instanceof WebPushError) {
          return { ok: false, gone: err.statusCode === 404 || err.statusCode === 410, message: `push service answered ${err.statusCode}: ${err.body}` };
        }
        return { ok: false, gone: false, message: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
