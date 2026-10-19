import type { z } from 'zod';

/**
 * The model provider behind all AI features. Feature code (prompts, context,
 * what to store) lives in services; a provider only transports a request to a
 * model and returns its raw answer, so it can be replaced by a fake in tests or
 * by another vendor later.
 */

export type AiInputPart = { type: 'text'; text: string } | { type: 'image'; dataUrl: string };

export interface StructuredRequest<S extends z.ZodType = z.ZodType> {
  /** System-level instructions. */
  instructions: string;
  /** The user turn: text and images, in order. */
  input: AiInputPart[];
  /** The answer must be JSON matching this schema. */
  schema: S;
  /** Short identifier for the schema, e.g. `health_assessment`. */
  schemaName: string;
  maxOutputTokens?: number;
}

export interface AiUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

/** What the model returned: JSON text to validate, or a refusal. */
export type ProviderReply =
  | { kind: 'output'; text: string; usage: AiUsage }
  | { kind: 'refusal'; message: string; usage: AiUsage };

export type ProviderErrorCode = 'timeout' | 'auth' | 'rate-limit' | 'bad-request' | 'unavailable';

/** A failed call. `code` is safe to log; `message` never contains the API key. */
export class AiProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export interface AiProvider {
  /** Model identifier, recorded with every request. */
  readonly model: string;
  generateStructured(request: StructuredRequest): Promise<ProviderReply>;
}
