import { Hono } from 'hono';
import { careScheduleInputSchema, dueQuerySchema, SCHEDULED_ACTIVITY_TYPES, snoozeInputSchema } from '@houseplant/shared';
import { z } from 'zod';
import { jsonBodyLimit, readJson, validate } from '../middleware/errors';
import type { CareService } from '../services/care';
import type { PlantService } from '../services/plants';

const activityTypeSchema = z.enum(SCHEDULED_ACTIVITY_TYPES, { message: 'only watering can have a schedule' });

/** A plant's care schedules, mounted under `/api/plants`. */
export function plantScheduleRoutes(care: CareService, plants: PlantService) {
  return new Hono()
    .get('/:id/schedules', (c) => c.json({ schedules: care.listForPlant(plants.get(c.req.param('id'))) }))
    .put('/:id/schedules/:type', jsonBodyLimit, async (c) => {
      const plant = plants.get(c.req.param('id'));
      const activityType = validate(activityTypeSchema, c.req.param('type'));
      const input = validate(careScheduleInputSchema, await readJson(c));
      return c.json({ schedule: care.setSchedule(plant, activityType, input) });
    });
}

/** Operations on one schedule, mounted under `/api/schedules`. */
export function scheduleRoutes(care: CareService, plants: PlantService) {
  return new Hono().post('/:id/snooze', jsonBodyLimit, async (c) => {
    const { days } = validate(snoozeInputSchema, await readJson(c));
    return c.json({ schedule: care.snooze(c.req.param('id'), days, (plantId) => plants.get(plantId)) });
  });
}

/** Plants that need a check soon, mounted at `/api/due`. */
export function dueRoutes(care: CareService, plants: PlantService) {
  return new Hono().get('/', (c) => {
    const { days = 0 } = validate(dueQuerySchema, c.req.query());
    return c.json({ items: care.dueItems(plants.records(), days) });
  });
}
