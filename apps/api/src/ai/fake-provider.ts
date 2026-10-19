import { AiProviderError, type AiProvider, type ProviderErrorCode, type ProviderReply, type StructuredRequest } from './provider';

/** What the fake should do for one request. */
export type FakeBehaviour =
  | { output: unknown }
  | { rawText: string }
  | { refusal: string }
  | { error: ProviderErrorCode };

/**
 * In-memory provider for tests: never touches the network. `respond` decides
 * the reply per request; every request is recorded in `requests`.
 */
export function createFakeProvider(respond: (request: StructuredRequest) => FakeBehaviour, model = 'fake-model') {
  const requests: StructuredRequest[] = [];
  const usage = { inputTokens: 100, outputTokens: 20 };

  const provider: AiProvider & { requests: StructuredRequest[] } = {
    model,
    requests,
    async generateStructured(request): Promise<ProviderReply> {
      requests.push(request);
      const behaviour = respond(request);
      if ('error' in behaviour) throw new AiProviderError(behaviour.error, `fake ${behaviour.error}`);
      if ('refusal' in behaviour) return { kind: 'refusal', message: behaviour.refusal, usage };
      const text = 'rawText' in behaviour ? behaviour.rawText : JSON.stringify(behaviour.output);
      return { kind: 'output', text, usage };
    },
  };
  return provider;
}
