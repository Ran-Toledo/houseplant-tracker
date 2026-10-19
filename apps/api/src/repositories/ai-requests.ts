import { count, gte } from 'drizzle-orm';
import type { Db } from '../db/client';
import { aiRequests, type AiRequestRow } from '../db/schema';

export function createAiRequestRepository(db: Db) {
  return {
    insert(row: AiRequestRow): void {
      db.insert(aiRequests).values(row).run();
    },

    /** Requests made since `since` (an ISO timestamp), whatever their outcome: every call costs. */
    countSince(since: string): number {
      return db.select({ n: count() }).from(aiRequests).where(gte(aiRequests.createdAt, since)).get()!.n;
    },
  };
}

export type AiRequestRepository = ReturnType<typeof createAiRequestRepository>;
