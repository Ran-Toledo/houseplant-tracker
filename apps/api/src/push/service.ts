import { randomUUID } from 'node:crypto';
import type { DigestInfo, DueItem, Language, PushDevice, PushPayload, PushSubscriptionInput } from '@houseplant/shared';
import type { PushSubscriptionRow } from '../db/schema';
import { localDate, localParts } from '../lib/zoned-time';
import { ApiError, notFound } from '../middleware/errors';
import { toPushDevice, type PushRepository } from '../repositories/push';
import type { CareService } from '../services/care';
import type { PlantService } from '../services/plants';
import type { SettingsService } from '../services/settings';
import type { PushSender } from './sender';

interface Deps {
  /** Null when push isn't set up (no VAPID keys). */
  sender: PushSender | null;
  repo: PushRepository;
  care: Pick<CareService, 'dueItems'>;
  plants: Pick<PlantService, 'records'>;
  settings: Pick<SettingsService, 'get'>;
  now?: () => Date;
}

const TEXT: Record<Language, { title: string; one: (name: string) => string; many: (count: number, names: string) => string; test: string }> = {
  en: {
    title: 'Houseplant Tracker',
    one: (name) => `Time to check ${name}'s soil`,
    many: (count, names) => `${count} plants to check today: ${names}`,
    test: 'Test notification: notifications work on this device.',
  },
  he: {
    title: 'מעקב עציצים',
    one: (name) => `הגיע הזמן לבדוק את האדמה של ${name}`,
    many: (count, names) => `${count} צמחים לבדיקה היום: ${names}`,
    test: 'התראת ניסיון: ההתראות עובדות במכשיר הזה.',
  },
};

/** The daily notification for the plants that are due. */
export function digestPayload(items: DueItem[], lang: Language): PushPayload {
  const text = TEXT[lang];
  const names = items.map((i) => i.nickname);
  return {
    title: text.title,
    body: items.length === 1 ? text.one(names[0]!) : text.many(items.length, names.join(', ')),
    url: items.length === 1 ? `/plants/${items[0]!.plantId}` : '/notifications',
    badge: items.length,
    tag: 'daily-digest',
  };
}

/** Web Push devices and the once-a-day care digest. */
export function createPushService({ sender, repo, care, plants, settings, now = () => new Date() }: Deps) {
  /** Sends to every device; drops subscriptions the push service no longer knows. Returns the counts. */
  async function sendAll(payloadFor: (lang: Language) => PushPayload, subscriptions: PushSubscriptionRow[]) {
    let sent = 0;
    let failed = 0;
    for (const sub of subscriptions) {
      const result = await sender!.send(sub, payloadFor(sub.lang));
      if (result.ok) {
        sent++;
        repo.recordSuccess(sub.id, now().toISOString());
        continue;
      }
      failed++;
      if (result.gone) repo.deleteSubscription(sub.id);
      else repo.recordFailure(sub.id);
      console.error(`[api] push to device ${sub.id} failed: ${result.message}`);
    }
    return { sent, failed };
  }

  function requireSender(): PushSender {
    if (!sender) throw new ApiError(503, 'push_not_configured', 'Push notifications are not set up: VAPID keys are missing');
    return sender;
  }

  let running = false;

  const service = {
    publicKey: sender?.publicKey ?? null,

    devices(): PushDevice[] {
      return repo.subscriptions().map(toPushDevice);
    },

    subscribe(input: PushSubscriptionInput): PushDevice {
      requireSender();
      const row = repo.upsertSubscription({
        id: randomUUID(),
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        lang: input.lang,
        userAgent: input.userAgent ?? null,
        createdAt: now().toISOString(),
        lastSuccessAt: null,
        failureCount: 0,
      });
      return toPushDevice(row);
    },

    unsubscribe(id: string): void {
      if (!repo.deleteSubscription(id)) throw notFound('Device');
    },

    async sendTest(): Promise<{ sent: number; failed: number }> {
      requireSender();
      const subscriptions = repo.subscriptions();
      if (subscriptions.length === 0) throw new ApiError(409, 'no_push_devices', 'No device has notifications turned on');
      return sendAll((lang) => ({ title: TEXT[lang].title, body: TEXT[lang].test, url: '/settings', badge: 0, tag: 'test' }), subscriptions);
    },

    latestDigest(): DigestInfo | null {
      return repo.latestDigest();
    },

    /**
     * Sends today's digest once the local notification time has passed. Safe
     * to call at any moment: a digest is claimed in the database before it is
     * sent, so restarts and overlapping ticks never send twice, and a server
     * that was off at notification time catches up later the same day.
     */
    async tick(): Promise<'not-due' | 'paused' | 'no-devices' | 'already-done' | 'skipped' | 'sent' | 'failed'> {
      if (!sender) return 'no-devices';
      if (running) return 'already-done';
      running = true;
      try {
        const s = settings.get();
        const instant = now();
        const today = localDate(instant, s.timezone);
        const { hour, minute } = localParts(instant, s.timezone);
        const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        if (time < s.notificationTime) return 'not-due';
        if (s.notificationsPausedUntil && today <= s.notificationsPausedUntil) return 'paused';
        const subscriptions = repo.subscriptions();
        // Without devices nothing is claimed, so a device enabled later today still gets today's digest.
        if (subscriptions.length === 0) return 'no-devices';

        const items = care.dueItems(plants.records(), 0);
        const id = randomUUID();
        const claimed = repo.claimDigest({
          id,
          channel: 'push',
          digestDate: today,
          plantIdsJson: JSON.stringify(items.map((i) => i.plantId)),
          // Stays "failed" unless at least one device receives it.
          status: items.length ? 'failed' : 'skipped',
          sentAt: instant.toISOString(),
        });
        if (!claimed) return 'already-done';
        if (items.length === 0) return 'skipped';

        const { sent } = await sendAll((lang) => digestPayload(items, lang), subscriptions);
        if (sent > 0) repo.setDigestStatus(id, 'sent');
        return sent > 0 ? 'sent' : 'failed';
      } finally {
        running = false;
      }
    },

    /** Checks once a minute; returns a function that stops it. */
    start(intervalMs = 60_000): () => void {
      const run = () => void service.tick().catch((err: unknown) => console.error('[api] daily digest failed', err));
      run();
      const timer = setInterval(run, intervalMs);
      timer.unref();
      return () => clearInterval(timer);
    },
  };
  return service;
}

export type PushService = ReturnType<typeof createPushService>;
