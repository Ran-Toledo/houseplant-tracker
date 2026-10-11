import { Hono } from 'hono';
import { activityInputSchema, plantCreateSchema, plantListQuerySchema, plantUpdateSchema } from '@houseplant/shared';
import { jsonBodyLimit, readJson, validate } from '../middleware/errors';
import type { PlantService } from '../services/plants';

export function plantRoutes(service: PlantService) {
  return (
    new Hono()
      .get('/', (c) => {
        const query = validate(plantListQuerySchema, c.req.query());
        return c.json({ plants: service.list(query) });
      })
      // Registered before `/:id` so "locations" isn't treated as a plant id.
      .get('/locations', (c) => c.json({ locations: service.locations() }))
      .get('/:id', (c) => c.json({ plant: service.get(c.req.param('id')) }))
      .post('/', jsonBodyLimit, async (c) => {
        const input = validate(plantCreateSchema, await readJson(c));
        return c.json({ plant: service.create(input) }, 201);
      })
      .patch('/:id', jsonBodyLimit, async (c) => {
        const input = validate(plantUpdateSchema, await readJson(c));
        return c.json({ plant: service.update(c.req.param('id'), input) });
      })
      .delete('/:id', async (c) => {
        await service.delete(c.req.param('id'));
        return c.body(null, 204);
      })

      // Activities (care history) belong to a plant.
      .get('/:id/activities', (c) => c.json({ activities: service.listActivities(c.req.param('id')) }))
      .post('/:id/activities', jsonBodyLimit, async (c) => {
        const input = validate(activityInputSchema, await readJson(c));
        return c.json({ activity: service.addActivity(c.req.param('id'), input) }, 201);
      })
      .delete('/:id/activities/:activityId', (c) => {
        service.deleteActivity(c.req.param('id'), c.req.param('activityId'));
        return c.body(null, 204);
      })
  );
}
