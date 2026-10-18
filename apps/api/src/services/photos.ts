import { randomUUID } from 'node:crypto';
import type { Photo } from '@houseplant/shared';
import { notFound } from '../middleware/errors';
import { toPhotoDto, type PhotoRepository } from '../repositories/photos';
import type { PlantRepository } from '../repositories/plants';
import type { PhotoStore } from '../storage/photo-store';
import { makeThumbnail, processImage } from './images';

const isMissingFile = (err: unknown) => (err as NodeJS.ErrnoException).code === 'ENOENT';

interface Deps {
  plants: PlantRepository;
  photos: PhotoRepository;
  photoStore: PhotoStore;
}

export function createPhotoService({ plants, photos, photoStore }: Deps) {
  function getRow(id: string) {
    const row = photos.get(id);
    if (!row) throw notFound('Photo');
    return row;
  }

  return {
    list(plantId: string): Photo[] {
      if (!plants.exists(plantId)) throw notFound('Plant');
      return photos.listForPlant(plantId).map(toPhotoDto);
    },

    async upload(
      plantId: string,
      data: Buffer,
      options: { makeCover: boolean; capturedAt: string | null },
    ): Promise<Photo> {
      if (!plants.exists(plantId)) throw notFound('Plant');
      const processed = await processImage(data);
      const thumbnail = await makeThumbnail(processed);

      const id = randomUUID();
      const storageKey = photoStore.keyFor(plantId, id);
      const thumbKey = photoStore.thumbKeyFor(storageKey);
      // Write the files first: a failed insert leaves only unreferenced files, never a broken record.
      await photoStore.save(storageKey, processed);
      await photoStore.save(thumbKey, thumbnail);
      try {
        const row = photos.insert(
          { id, plantId, storageKey, capturedAt: options.capturedAt, createdAt: new Date().toISOString() },
          options.makeCover,
        );
        return toPhotoDto(row);
      } catch (err) {
        await photoStore.remove(storageKey).catch(() => {});
        await photoStore.remove(thumbKey).catch(() => {});
        throw err;
      }
    },

    async readFile(id: string): Promise<Buffer> {
      const row = getRow(id);
      try {
        return await photoStore.read(row.storageKey);
      } catch (err) {
        if (isMissingFile(err)) throw notFound('Photo file');
        throw err;
      }
    },

    /**
     * Reads a photo's thumbnail. Photos uploaded before thumbnails existed (or
     * restored from a backup, which skips them) get one generated on first request.
     */
    async readThumbnail(id: string): Promise<Buffer> {
      const row = getRow(id);
      const thumbKey = photoStore.thumbKeyFor(row.storageKey);
      try {
        return await photoStore.read(thumbKey);
      } catch (err) {
        if (!isMissingFile(err)) throw err;
      }
      let full: Buffer;
      try {
        full = await photoStore.read(row.storageKey);
      } catch (err) {
        if (isMissingFile(err)) throw notFound('Photo file');
        throw err;
      }
      const thumbnail = await makeThumbnail(full);
      await photoStore.save(thumbKey, thumbnail);
      return thumbnail;
    },

    setCover(id: string): Photo {
      const row = getRow(id);
      photos.setCover(row);
      return toPhotoDto({ ...row, isCover: true });
    },

    async delete(id: string): Promise<void> {
      const row = getRow(id);
      photos.delete(row);
      try {
        await photoStore.remove(row.storageKey);
        await photoStore.remove(photoStore.thumbKeyFor(row.storageKey));
      } catch (err) {
        console.error(`[api] could not remove photo file ${row.storageKey}`, err);
      }
    },
  };
}

export type PhotoService = ReturnType<typeof createPhotoService>;
