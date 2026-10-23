import { desc, eq, sql } from 'drizzle-orm';
import type { DigestInfo, PushDevice } from '@houseplant/shared';
import type { Db } from '../db/client';
import { notifications, pushSubscriptions, type NotificationRow, type PushSubscriptionRow } from '../db/schema';

export function toPushDevice(row: PushSubscriptionRow): PushDevice {
  return {
    id: row.id,
    endpoint: row.endpoint,
    lang: row.lang,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    lastSuccessAt: row.lastSuccessAt,
  };
}

export function createPushRepository(db: Db) {
  return {
    subscriptions(): PushSubscriptionRow[] {
      return db.select().from(pushSubscriptions).orderBy(desc(pushSubscriptions.createdAt)).all();
    },

    /** Adds a subscription, or refreshes the keys and language of a known endpoint. */
    upsertSubscription(row: PushSubscriptionRow): PushSubscriptionRow {
      db.insert(pushSubscriptions)
        .values(row)
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { p256dh: row.p256dh, auth: row.auth, lang: row.lang, userAgent: row.userAgent, failureCount: 0 },
        })
        .run();
      return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, row.endpoint)).get()!;
    },

    deleteSubscription(id: string): boolean {
      return db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id)).run().changes > 0;
    },

    recordSuccess(id: string, at: string): void {
      db.update(pushSubscriptions).set({ lastSuccessAt: at, failureCount: 0 }).where(eq(pushSubscriptions.id, id)).run();
    },

    recordFailure(id: string): void {
      db.update(pushSubscriptions)
        .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
        .where(eq(pushSubscriptions.id, id))
        .run();
    },

    /**
     * Claims the digest for a date: inserts its row, or returns false when a
     * digest for that date already exists (sent, failed or skipped).
     */
    claimDigest(row: NotificationRow): boolean {
      return db.insert(notifications).values(row).onConflictDoNothing().run().changes > 0;
    },

    setDigestStatus(id: string, status: NotificationRow['status']): void {
      db.update(notifications).set({ status }).where(eq(notifications.id, id)).run();
    },

    latestDigest(): DigestInfo | null {
      const row = db.select().from(notifications).orderBy(desc(notifications.digestDate)).limit(1).get();
      if (!row) return null;
      return {
        digestDate: row.digestDate,
        status: row.status,
        plantCount: (JSON.parse(row.plantIdsJson) as string[]).length,
        sentAt: row.sentAt,
      };
    },
  };
}

export type PushRepository = ReturnType<typeof createPushRepository>;
