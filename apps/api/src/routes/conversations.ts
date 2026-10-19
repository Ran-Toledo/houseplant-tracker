import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { chatMessageInputSchema, conversationCreateSchema, conversationListQuerySchema } from '@houseplant/shared';
import type { AssistantService } from '../assistant/service';
import { jsonBodyLimit, readJson, validate } from '../middleware/errors';

/** Assistant conversations, mounted under `/api/conversations`. */
export function conversationRoutes(service: AssistantService) {
  return new Hono()
    .get('/', (c) => {
      const { plantId } = validate(conversationListQuerySchema, c.req.query());
      return c.json({ conversations: service.list(plantId) });
    })
    .post('/', jsonBodyLimit, async (c) => {
      const { plantId } = validate(conversationCreateSchema, await readJson(c));
      return c.json({ conversation: service.create(plantId ?? null) }, 201);
    })
    .get('/:id', (c) => c.json({ conversation: service.get(c.req.param('id')) }))
    .get('/:id/messages', (c) => c.json({ messages: service.messages(c.req.param('id')) }))
    .post('/:id/messages', jsonBodyLimit, async (c) => {
      const input = validate(chatMessageInputSchema, await readJson(c));
      // Checked before streaming, so these failures are ordinary JSON errors.
      const prepared = await service.prepare(c.req.param('id'), input);
      // nginx would otherwise buffer the stream and deliver the answer all at once.
      c.header('X-Accel-Buffering', 'no');
      c.header('Cache-Control', 'no-cache');
      return streamSSE(c, async (stream) => {
        await service.reply(prepared, input, (event) => stream.writeSSE({ event: event.type, data: JSON.stringify(event) }));
      });
    })
    .delete('/:id', (c) => {
      service.delete(c.req.param('id'));
      return c.body(null, 204);
    });
}
