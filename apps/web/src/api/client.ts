import type { ApiErrorBody } from '@houseplant/shared';

/** A failed API call. `code` matches the server's error codes, or `network`. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const hasJsonBody = init.body !== undefined && !(init.body instanceof FormData);
  try {
    return await fetch(`/api${path}`, {
      ...init,
      headers: hasJsonBody ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
    });
  } catch {
    throw new ApiRequestError(0, 'network', 'Network request failed');
  }
}

async function errorFrom(res: Response): Promise<ApiRequestError> {
  const body: unknown = await res.json().catch(() => null);
  const error = (body as ApiErrorBody | null)?.error;
  return new ApiRequestError(
    res.status,
    error?.code ?? 'http_error',
    error?.message ?? res.statusText,
    Array.isArray(error?.details) ? (error.details as { path: string; message: string }[]) : undefined,
  );
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await send(path, init);
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await errorFrom(res);
  return (await res.json().catch(() => null)) as T;
}

/**
 * POSTs and reads a Server-Sent Events response, calling `onEvent` with each
 * event's JSON data. Errors before the stream starts are thrown as usual.
 */
export async function streamEvents<E>(path: string, init: RequestInit, onEvent: (event: E) => void): Promise<void> {
  const res = await send(path, init);
  if (!res.ok) throw await errorFrom(res);
  if (!res.body) throw new ApiRequestError(0, 'network', 'The response has no body');
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  const flush = (block: string) => {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (data) onEvent(JSON.parse(data) as E);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value.replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        flush(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
      }
    }
  } catch {
    throw new ApiRequestError(0, 'network', 'The connection was interrupted');
  }
  if (buffer.trim()) flush(buffer);
}

export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});
