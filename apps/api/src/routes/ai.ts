import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { healthCheckInputSchema, identifyInputSchema } from '@houseplant/shared';
import { ApiError, jsonBodyLimit, readJson, validate } from '../middleware/errors';
import type { HealthCheckService } from '../services/health-checks';
import type { IdentifyService } from '../services/identify';

/** AI features without a home resource, mounted under `/api/ai`. */
export function aiRoutes(identify: IdentifyService, maxUploadBytes: number) {
  const tooLarge = (): never => {
    const mb = Math.round(maxUploadBytes / 1024 / 1024);
    throw new ApiError(413, 'payload_too_large', `Photos must be smaller than ${mb} MB`);
  };

  return new Hono().post(
    '/identify',
    bodyLimit({ maxSize: maxUploadBytes + 64 * 1024, onError: tooLarge }),
    async (c) => {
      // JSON names a stored photo; a multipart upload is identified without being stored.
      if (c.req.header('Content-Type')?.startsWith('application/json')) {
        const { photoId } = validate(identifyInputSchema, await readJson(c));
        return c.json(await identify.identifyPhoto(photoId));
      }
      let form: Record<string, string | File>;
      try {
        form = await c.req.parseBody();
      } catch {
        throw new ApiError(400, 'invalid_form', 'Expected a multipart/form-data upload or a JSON body');
      }
      const file = form.photo;
      if (!(file instanceof File) || file.size === 0) {
        throw new ApiError(400, 'validation_error', 'A non-empty "photo" file field is required', [
          { path: 'photo', message: 'is required' },
        ]);
      }
      if (file.size > maxUploadBytes) tooLarge();
      return c.json(await identify.identifyUpload(Buffer.from(await file.arrayBuffer())));
    },
  );
}

/** A plant's health checks, mounted under `/api/plants`. */
export function plantHealthCheckRoutes(service: HealthCheckService) {
  return new Hono()
    .get('/:id/health-checks', (c) => c.json({ healthChecks: service.list(c.req.param('id')) }))
    .post('/:id/health-checks', jsonBodyLimit, async (c) => {
      const { photoId } = validate(healthCheckInputSchema, await readJson(c));
      return c.json({ healthCheck: await service.create(c.req.param('id'), photoId) }, 201);
    });
}

/** Operations on one health check, mounted under `/api/health-checks`. */
export function healthCheckRoutes(service: HealthCheckService) {
  return new Hono()
    .post('/:id/apply', (c) => c.json(service.apply(c.req.param('id'))))
    .delete('/:id', (c) => {
      service.delete(c.req.param('id'));
      return c.body(null, 204);
    });
}
