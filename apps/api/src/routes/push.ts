import { Hono } from 'hono';
import { pushSubscriptionInputSchema } from '@houseplant/shared';
import { jsonBodyLimit, readJson, validate } from '../middleware/errors';
import type { PushService } from '../push/service';

/** Web Push devices, the test message and the digest status, mounted under `/api/push`. */
export function pushRoutes(service: PushService) {
  return new Hono()
    .get('/subscriptions', (c) => c.json({ devices: service.devices() }))
    .post('/subscriptions', jsonBodyLimit, async (c) => {
      const input = validate(pushSubscriptionInputSchema, await readJson(c));
      return c.json({ device: service.subscribe(input) }, 201);
    })
    .delete('/subscriptions/:id', (c) => {
      service.unsubscribe(c.req.param('id'));
      return c.body(null, 204);
    })
    .post('/test', async (c) => c.json(await service.sendTest()))
    .get('/status', (c) => c.json({ lastDigest: service.latestDigest() }));
}
