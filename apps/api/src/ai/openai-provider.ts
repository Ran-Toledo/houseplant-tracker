import OpenAI, { APIConnectionTimeoutError, APIError } from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ResponseInputContent } from 'openai/resources/responses/responses';
import { AiProviderError, type AiProvider, type AiUsage, type ProviderReply, type StructuredRequest } from './provider';

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

/** OpenAI Responses API with structured output. Requests are never stored at OpenAI (`store: false`). */
export function createOpenAiProvider({ apiKey, model, timeoutMs }: OpenAiProviderOptions): AiProvider {
  const client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 1 });

  return {
    model,

    async generateStructured(request: StructuredRequest): Promise<ProviderReply> {
      const content: ResponseInputContent[] = request.input.map((part) =>
        part.type === 'text'
          ? { type: 'input_text', text: part.text }
          : { type: 'input_image', image_url: part.dataUrl, detail: 'auto' },
      );

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

      const usage: AiUsage = {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      };
      for (const item of response.output) {
        if (item.type !== 'message') continue;
        const refusal = item.content.find((c) => c.type === 'refusal');
        if (refusal) return { kind: 'refusal', message: refusal.refusal, usage };
      }
      return { kind: 'output', text: response.output_text, usage };
    },
  };
}
