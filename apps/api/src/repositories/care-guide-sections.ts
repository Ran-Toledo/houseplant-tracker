import { inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { careGuideSections, type CareGuideSectionRow } from '../db/schema';

export function createCareGuideSectionRepository(db: Db) {
  return {
    list(): CareGuideSectionRow[] {
      return db.select().from(careGuideSections).all();
    },

    /** Inserts or replaces sections, all in one transaction. */
    upsert(rows: CareGuideSectionRow[]): void {
      if (rows.length === 0) return;
      db.transaction((tx) => {
        for (const row of rows) {
          tx.insert(careGuideSections)
            .values(row)
            .onConflictDoUpdate({
              target: careGuideSections.id,
              set: {
                title: sql`excluded.title`,
                content: sql`excluded.content`,
                contentHash: sql`excluded.content_hash`,
                model: sql`excluded.model`,
                vector: sql`excluded.vector`,
                createdAt: sql`excluded.created_at`,
              },
            })
            .run();
        }
      });
    },

    delete(ids: string[]): void {
      if (ids.length === 0) return;
      db.delete(careGuideSections).where(inArray(careGuideSections.id, ids)).run();
    },
  };
}

export type CareGuideSectionRepository = ReturnType<typeof createCareGuideSectionRepository>;
