import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorBody } from '@houseplant/shared';
import { z } from 'zod';

/** An error that maps directly to an HTTP response. */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notFound = (what: string) => new ApiError(404, 'not_found', `${what} not found`);

/** Parses `input` with `schema`, throwing a 400 with field-level details on failure. */
export function validate<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const summary = details.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message)).join('; ');
    throw new ApiError(400, 'validation_error', `Invalid request: ${summary}`, details);
  }
  return result.data;
}

/** Rejects JSON bodies over 64 KB, far beyond any legitimate plant or activity payload. */
export const jsonBodyLimit = bodyLimit({
  maxSize: 64 * 1024,
  onError: () => {
    throw new ApiError(413, 'payload_too_large', 'Request body is too large');
  },
});

/** Reads a JSON request body, turning malformed JSON into a 400. */
export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON');
  }
}

function body(code: string, message: string, details?: unknown): ApiErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

export function handleError(err: Error, c: Context) {
  if (err instanceof ApiError) {
    return c.json(body(err.code, err.message, err.details), err.status);
  }
  if (err instanceof HTTPException) {
    const status = err.status as ContentfulStatusCode;
    return c.json(body(status === 413 ? 'payload_too_large' : 'http_error', err.message), status);
  }
  console.error('[api] unhandled error', err);
  return c.json(body('internal_error', 'An unexpected error occurred'), 500);
}

export function handleNotFound(c: Context) {
  return c.json(body('not_found', `No route for ${c.req.method} ${c.req.path}`), 404);
}
