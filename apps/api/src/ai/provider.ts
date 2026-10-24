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

/** A function the model may call during a chat. */
export interface ChatToolDef {
  name: string;
  description: string;
  parameters: z.ZodObject;
}

/** One item of chat input. */
export type ChatInputItem =
  | { type: 'message'; role: 'user'; content: AiInputPart[] }
  | { type: 'message'; role: 'assistant'; text: string }
  | { type: 'tool-result'; callId: string; output: string }
  /** An item from an earlier step's output (reasoning, a tool call), sent back unchanged. */
  | { type: 'provider'; item: unknown };

export interface ChatRequest {
  instructions: string;
  input: ChatInputItem[];
  /** Empty to make the model answer without calling tools. */
  tools: ChatToolDef[];
  maxOutputTokens?: number;
}

export interface ToolCall {
  callId: string;
  name: string;
  /** JSON text. */
  arguments: string;
}

/** One model call of a chat: streamed text, and tool calls to run before the next call. */
export interface ChatStep {
  text: string;
  toolCalls: ToolCall[];
  /** The step's output items, to append to the input of the next step. */
  items: ChatInputItem[];
  /** Set when the model declined to answer. */
  refusal: string | null;
  usage: AiUsage;
}

/** Embedding vectors, one per input and in the same order. */
export interface EmbedReply {
  vectors: number[][];
  usage: AiUsage;
}

export interface AiProvider {
  /** Model identifier, recorded with every request. */
  readonly model: string;
  /** Embedding model identifier, recorded with embedding requests. */
  readonly embeddingModel: string;
  generateStructured(request: StructuredRequest): Promise<ProviderReply>;
  /** Runs one chat step, calling `onText` with each piece of text as it streams in. */
  streamChat(request: ChatRequest, onText: (delta: string) => void): Promise<ChatStep>;
  /** Embeds texts in one request. */
  embed(inputs: string[]): Promise<EmbedReply>;
}
