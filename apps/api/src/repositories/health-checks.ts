import { desc, eq } from 'drizzle-orm';
import type { HealthAssessment, HealthCheck } from '@houseplant/shared';
import type { Db } from '../db/client';
import { healthChecks, photos, type HealthCheckRow, type PhotoRow } from '../db/schema';
import { toPhotoDto } from './photos';

function toHealthCheckDto(row: HealthCheckRow, photo: PhotoRow | null): HealthCheck {
  return {
    id: row.id,
    plantId: row.plantId,
    photo: photo ? toPhotoDto(photo) : null,
    condition: row.condition,
    confidence: row.confidence,
    assessment: JSON.parse(row.assessmentJson) as HealthAssessment,
    appliedAt: row.appliedAt,
    createdAt: row.createdAt,
  };
}

export function createHealthCheckRepository(db: Db) {
  const withPhoto = () =>
    db.select({ check: healthChecks, photo: photos }).from(healthChecks).leftJoin(photos, eq(photos.id, healthChecks.photoId));

  return {
    /** A plant's checks, newest first. */
    listForPlant(plantId: string): HealthCheck[] {
      return withPhoto()
        .where(eq(healthChecks.plantId, plantId))
        .orderBy(desc(healthChecks.createdAt), desc(healthChecks.id))
        .all()
        .map((r) => toHealthCheckDto(r.check, r.photo));
    },

    get(id: string): HealthCheck | undefined {
      const r = withPhoto().where(eq(healthChecks.id, id)).get();
      return r && toHealthCheckDto(r.check, r.photo);
    },

    insert(row: HealthCheckRow): void {
      db.insert(healthChecks).values(row).run();
    },

    setApplied(id: string, appliedAt: string): void {
      db.update(healthChecks).set({ appliedAt }).where(eq(healthChecks.id, id)).run();
    },

    delete(id: string): boolean {
      return db.delete(healthChecks).where(eq(healthChecks.id, id)).run().changes > 0;
    },
  };
}

export type HealthCheckRepository = ReturnType<typeof createHealthCheckRepository>;
