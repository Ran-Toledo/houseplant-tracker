import { randomUUID } from 'node:crypto';
import type { Photo } from '@houseplant/shared';
import { notFound } from '../middleware/errors';
import { toPhotoDto, type PhotoRepository } from '../repositories/photos';
import type { PlantRepository } from '../repositories/plants';
import type { PhotoStore } from '../storage/photo-store';
import { processImage } from './images';

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

      const id = randomUUID();
      const storageKey = photoStore.keyFor(plantId, id);
      // Write the file first: a failed insert leaves only an unreferenced file, never a broken record.
      await photoStore.save(storageKey, processed);
      try {
        const row = photos.insert(
          { id, plantId, storageKey, capturedAt: options.capturedAt, createdAt: new Date().toISOString() },
          options.makeCover,
        );
        return toPhotoDto(row);
      } catch (err) {
        await photoStore.remove(storageKey).catch(() => {});
        throw err;
      }
    },

    async readFile(id: string): Promise<Buffer> {
      const row = getRow(id);
      try {
        return await photoStore.read(row.storageKey);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw notFound('Photo file');
        throw err;
      }
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
      } catch (err) {
        console.error(`[api] could not remove photo file ${row.storageKey}`, err);
      }
    },
  };
}

export type PhotoService = ReturnType<typeof createPhotoService>;
