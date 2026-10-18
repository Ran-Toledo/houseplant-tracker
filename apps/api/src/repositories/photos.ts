import { and, desc, eq } from 'drizzle-orm';
import type { Photo } from '@houseplant/shared';
import type { Db } from '../db/client';
import { photos, type PhotoRow } from '../db/schema';

export function toPhotoDto(row: PhotoRow): Photo {
  return {
    id: row.id,
    plantId: row.plantId,
    url: `/api/photos/${row.id}/file`,
    thumbnailUrl: `/api/photos/${row.id}/thumb`,
    isCover: row.isCover,
    capturedAt: row.capturedAt,
    createdAt: row.createdAt,
  };
}

export function createPhotoRepository(db: Db) {
  const newestFirst = [desc(photos.createdAt), desc(photos.id)];

  return {
    listForPlant(plantId: string): PhotoRow[] {
      return db.select().from(photos).where(eq(photos.plantId, plantId)).orderBy(...newestFirst).all();
    },

    get(id: string): PhotoRow | undefined {
      return db.select().from(photos).where(eq(photos.id, id)).get();
    },

    /** Inserts a photo. The plant's first photo always becomes its cover. */
    insert(row: Omit<PhotoRow, 'isCover'>, makeCover: boolean): PhotoRow {
      return db.transaction((tx) => {
        const hasCover = tx
          .select({ id: photos.id })
          .from(photos)
          .where(and(eq(photos.plantId, row.plantId), eq(photos.isCover, true)))
          .get();
        const isCover = makeCover || !hasCover;
        if (isCover && hasCover) {
          tx.update(photos).set({ isCover: false }).where(eq(photos.plantId, row.plantId)).run();
        }
        tx.insert(photos).values({ ...row, isCover }).run();
        return { ...row, isCover };
      });
    },

    setCover(photo: PhotoRow): void {
      db.transaction((tx) => {
        tx.update(photos).set({ isCover: false }).where(eq(photos.plantId, photo.plantId)).run();
        tx.update(photos).set({ isCover: true }).where(eq(photos.id, photo.id)).run();
      });
    },

    /** Deletes a photo row; if it was the cover, the newest remaining photo takes over. */
    delete(photo: PhotoRow): void {
      db.transaction((tx) => {
        tx.delete(photos).where(eq(photos.id, photo.id)).run();
        if (!photo.isCover) return;
        const next = tx
          .select({ id: photos.id })
          .from(photos)
          .where(eq(photos.plantId, photo.plantId))
          .orderBy(...newestFirst)
          .get();
        if (next) tx.update(photos).set({ isCover: true }).where(eq(photos.id, next.id)).run();
      });
    },
  };
}

export type PhotoRepository = ReturnType<typeof createPhotoRepository>;
