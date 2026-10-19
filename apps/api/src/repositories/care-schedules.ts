import { and, desc, eq, inArray } from 'drizzle-orm';
import type { ScheduledActivityType } from '@houseplant/shared';
import type { Db } from '../db/client';
import { activities, careSchedules, type CareScheduleRow } from '../db/schema';

export function createCareScheduleRepository(db: Db) {
  return {
    get(id: string): CareScheduleRow | undefined {
      return db.select().from(careSchedules).where(eq(careSchedules.id, id)).get();
    },

    listForPlant(plantId: string): CareScheduleRow[] {
      return db.select().from(careSchedules).where(eq(careSchedules.plantId, plantId)).all();
    },

    /** Enabled schedules of one activity type, optionally only for some plants. */
    listEnabled(activityType: ScheduledActivityType, plantIds?: string[]): CareScheduleRow[] {
      const conditions = [eq(careSchedules.activityType, activityType), eq(careSchedules.enabled, true)];
      if (plantIds) {
        if (plantIds.length === 0) return [];
        conditions.push(inArray(careSchedules.plantId, plantIds));
      }
      return db.select().from(careSchedules).where(and(...conditions)).all();
    },

    /** Creates or replaces the plant's schedule for that activity type. */
    upsert(row: CareScheduleRow): CareScheduleRow {
      const { id: _id, createdAt: _createdAt, plantId: _plantId, activityType: _type, ...changes } = row;
      return db
        .insert(careSchedules)
        .values(row)
        .onConflictDoUpdate({ target: [careSchedules.plantId, careSchedules.activityType], set: changes })
        .returning()
        .get();
    },

    setSnooze(id: string, snoozedUntil: string | null, now: string): void {
      db.update(careSchedules).set({ snoozedUntil, updatedAt: now }).where(eq(careSchedules.id, id)).run();
    },

    clearSnooze(plantId: string, activityType: ScheduledActivityType, now: string): void {
      db.update(careSchedules)
        .set({ snoozedUntil: null, updatedAt: now })
        .where(and(eq(careSchedules.plantId, plantId), eq(careSchedules.activityType, activityType)))
        .run();
    },

    /** Timestamps of each plant's most recent activities of a type, newest first, at most `perPlant` each. */
    recentActivityTimes(activityType: ScheduledActivityType, plantIds: string[], perPlant: number): Map<string, string[]> {
      const result = new Map<string, string[]>();
      if (plantIds.length === 0) return result;
      const rows = db
        .select({ plantId: activities.plantId, performedAt: activities.performedAt })
        .from(activities)
        .where(and(eq(activities.activityType, activityType), inArray(activities.plantId, plantIds)))
        .orderBy(desc(activities.performedAt))
        .all();
      for (const row of rows) {
        const list = result.get(row.plantId) ?? [];
        if (list.length < perPlant) list.push(row.performedAt);
        result.set(row.plantId, list);
      }
      return result;
    },
  };
}

export type CareScheduleRepository = ReturnType<typeof createCareScheduleRepository>;
