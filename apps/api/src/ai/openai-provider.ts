import OpenAI, { APIConnectionTimeoutError, APIError } from 'openai';
import { zodResponsesFunction, zodTextFormat } from 'openai/helpers/zod';
import type { ResponseInputContent, ResponseInputItem } from 'openai/resources/responses/responses';
import {
  AiProviderError,
  type AiInputPart,
  type AiProvider,
  type AiUsage,
  type ChatInputItem,
  type ChatRequest,
  type ChatStep,
  type ProviderReply,
  type StructuredRequest,
} from './provider';

export interface OpenAiProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

function toProviderError(err: unknown): AiProviderError {
  if (err instanceof APIConnectionTimeoutError) return new AiProviderError('timeout', 'The AI request timed out');
  if (err instanceof APIError) {
    const status = err.status ?? 0;
    const code = status === 401 || status === 403 ? 'auth' : status === 429 ? 'rate-limit' : status === 400 ? 'bad-request' : 'unavailable';
    // The SDK's messages describe the failure without echoing the key.
    return new AiProviderError(code, `OpenAI API error ${status}: ${err.message}`);
  }
  return new AiProviderError('unavailable', err instanceof Error ? err.message : 'Unknown AI provider error');
}

function toContent(parts: AiInputPart[]): ResponseInputContent[] {
  return parts.map((part) =>
    part.type === 'text'
      ? { type: 'input_text', text: part.text }
      : { type: 'input_image', image_url: part.dataUrl, detail: 'auto' },
  );
}

function toInputItem(item: ChatInputItem): ResponseInputItem {
  switch (item.type) {
    case 'message':
      return item.role === 'user'
        ? { role: 'user', content: toContent(item.content) }
        : { role: 'assistant', content: item.text };
    case 'tool-result':
      return { type: 'function_call_output', call_id: item.callId, output: item.output };
    case 'provider':
      return item.item as ResponseInputItem;
  }
}

const usageOf = (response: OpenAI.Responses.Response): AiUsage => ({
  inputTokens: response.usage?.input_tokens ?? null,
  outputTokens: response.usage?.output_tokens ?? null,
});

function refusalOf(response: OpenAI.Responses.Response): string | null {
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    const refusal = item.content.find((c) => c.type === 'refusal');
    if (refusal) return refusal.refusal;
  }
  return null;
}

/** OpenAI Responses API with structured output. Requests are never stored at OpenAI (`store: false`). */
export function createOpenAiProvider({ apiKey, model, timeoutMs }: OpenAiProviderOptions): AiProvider {
  const client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 1 });

  return {
    model,

    async generateStructured(request: StructuredRequest): Promise<ProviderReply> {
      const content = toContent(request.input);

      let response: OpenAI.Responses.Response;
      try {
        response = await client.responses.create({
          model,
          instructions: request.instructions,
          input: [{ role: 'user', content }],
          text: { format: zodTextFormat(request.schema, request.schemaName) },
          max_output_tokens: request.maxOutputTokens ?? 4000,
          store: false,
        });
      } catch (err) {
        throw toProviderError(err);
      }

      const usage = usageOf(response);
      const refusal = refusalOf(response);
      if (refusal) return { kind: 'refusal', message: refusal, usage };
      return { kind: 'output', text: response.output_text, usage };
    },

    async streamChat(request: ChatRequest, onText: (delta: string) => void): Promise<ChatStep> {
      let response: OpenAI.Responses.Response | undefined;
      try {
        const stream = await client.responses.create({
          model,
          instructions: request.instructions,
          input: request.input.map(toInputItem),
          tools: request.tools.map((t) => zodResponsesFunction({ name: t.name, description: t.description, parameters: t.parameters })),
          max_output_tokens: request.maxOutputTokens ?? 4000,
          stream: true,
          store: false,
          // Without stored state, reasoning is carried between tool rounds in encrypted form.
          include: ['reasoning.encrypted_content'],
        });
        for await (const event of stream) {
          if (event.type === 'response.output_text.delta') onText(event.delta);
          else if (event.type === 'response.completed' || event.type === 'response.incomplete') response = event.response;
          else if (event.type === 'response.failed') {
            throw new AiProviderError('unavailable', `OpenAI response failed: ${event.response.error?.message ?? 'unknown error'}`);
          } else if (event.type === 'error') throw new AiProviderError('unavailable', `OpenAI stream error: ${event.message}`);
        }
      } catch (err) {
        throw err instanceof AiProviderError ? err : toProviderError(err);
      }
      if (!response) throw new AiProviderError('unavailable', 'The OpenAI stream ended without a response');

      return {
        text: response.output_text,
        toolCalls: response.output.flatMap((item) =>
          item.type === 'function_call' ? [{ callId: item.call_id, name: item.name, arguments: item.arguments }] : [],
        ),
        items: response.output.map((item) => ({ type: 'provider', item })),
        refusal: refusalOf(response),
        usage: usageOf(response),
      };
    },
  };
}
