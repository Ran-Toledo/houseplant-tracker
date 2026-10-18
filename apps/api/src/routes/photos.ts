import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { timestampSchema } from '@houseplant/shared';
import { ApiError, jsonBodyLimit, readJson, validate } from '../middleware/errors';
import type { PhotoService } from '../services/photos';

const uploadFieldsSchema = z.object({
  isCover: z.enum(['true', 'false']).optional(),
  capturedAt: timestampSchema.optional(),
});

const coverSchema = z.strictObject({ isCover: z.literal(true) });

/** Photo listing and upload, mounted under `/api/plants`. */
export function plantPhotoRoutes(service: PhotoService, maxUploadBytes: number) {
  const tooLarge = (): never => {
    const mb = Math.round(maxUploadBytes / 1024 / 1024);
    throw new ApiError(413, 'payload_too_large', `Photos must be smaller than ${mb} MB`);
  };

  return new Hono()
    .get('/:id/photos', (c) => c.json({ photos: service.list(c.req.param('id')) }))
    .post(
      '/:id/photos',
      // Leave headroom for multipart boundaries and the other form fields.
      bodyLimit({ maxSize: maxUploadBytes + 64 * 1024, onError: tooLarge }),
      async (c) => {
        let form: Record<string, string | File>;
        try {
          form = await c.req.parseBody();
        } catch {
          throw new ApiError(400, 'invalid_form', 'Expected a multipart/form-data upload');
        }
        const file = form.photo;
        if (!(file instanceof File) || file.size === 0) {
          throw new ApiError(400, 'validation_error', 'A non-empty "photo" file field is required', [
            { path: 'photo', message: 'is required' },
          ]);
        }
        if (file.size > maxUploadBytes) tooLarge();
        const fields = validate(uploadFieldsSchema, { isCover: form.isCover, capturedAt: form.capturedAt });

        const photo = await service.upload(c.req.param('id'), Buffer.from(await file.arrayBuffer()), {
          makeCover: fields.isCover === 'true',
          capturedAt: fields.capturedAt ?? null,
        });
        return c.json({ photo }, 201);
      },
    );
}

const jpegHeaders = {
  'Content-Type': 'image/jpeg',
  // Photo ids are never reused, so the file at this URL never changes.
  'Cache-Control': 'private, max-age=31536000, immutable',
  'X-Content-Type-Options': 'nosniff',
};

/** Individual photo operations, mounted under `/api/photos`. */
export function photoRoutes(service: PhotoService) {
  return new Hono()
    .get('/:id/file', async (c) => {
      const data = await service.readFile(c.req.param('id'));
      return c.body(new Uint8Array(data), 200, jpegHeaders);
    })
    .get('/:id/thumb', async (c) => {
      const data = await service.readThumbnail(c.req.param('id'));
      return c.body(new Uint8Array(data), 200, jpegHeaders);
    })
    .patch('/:id', jsonBodyLimit, async (c) => {
      validate(coverSchema, await readJson(c));
      return c.json({ photo: service.setCover(c.req.param('id')) });
    })
    .delete('/:id', async (c) => {
      await service.delete(c.req.param('id'));
      return c.body(null, 204);
    });
}
