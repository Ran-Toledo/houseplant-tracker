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

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const hasJsonBody = init.body !== undefined && !(init.body instanceof FormData);
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: hasJsonBody ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
    });
  } catch {
    throw new ApiRequestError(0, 'network', 'Network request failed');
  }

  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new ApiRequestError(
      res.status,
      error?.code ?? 'http_error',
      error?.message ?? res.statusText,
      Array.isArray(error?.details) ? (error.details as { path: string; message: string }[]) : undefined,
    );
  }
  return body as T;
}

export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});
