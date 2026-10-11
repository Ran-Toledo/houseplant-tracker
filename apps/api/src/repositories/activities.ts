import { and, desc, eq } from 'drizzle-orm';
import type { Activity } from '@houseplant/shared';
import type { Db } from '../db/client';
import { activities, type ActivityRow } from '../db/schema';

export function createActivityRepository(db: Db) {
  return {
    listForPlant(plantId: string): Activity[] {
      return db
        .select()
        .from(activities)
        .where(eq(activities.plantId, plantId))
        .orderBy(desc(activities.performedAt), desc(activities.createdAt))
        .all();
    },

    insert(rows: ActivityRow[]): void {
      if (rows.length > 0) db.insert(activities).values(rows).run();
    },

    delete(plantId: string, activityId: string): boolean {
      return (
        db
          .delete(activities)
          .where(and(eq(activities.id, activityId), eq(activities.plantId, plantId)))
          .run().changes > 0
      );
    },
  };
}

export type ActivityRepository = ReturnType<typeof createActivityRepository>;
