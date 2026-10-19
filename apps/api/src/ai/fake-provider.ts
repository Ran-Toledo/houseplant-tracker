import {
  AiProviderError,
  type AiProvider,
  type ChatRequest,
  type ChatStep,
  type ProviderErrorCode,
  type ProviderReply,
  type StructuredRequest,
} from './provider';

/** What the fake should do for one request. */
export type FakeBehaviour =
  | { output: unknown }
  | { rawText: string }
  | { refusal: string }
  | { error: ProviderErrorCode };

/** What the fake should do for one chat step. */
export type FakeChatBehaviour =
  | { text: string }
  | { toolCalls: { name: string; arguments: unknown }[] }
  | { refusal: string }
  | { error: ProviderErrorCode };

/**
 * In-memory provider for tests: never touches the network. `respond` decides
 * the reply per request and `chat` per chat step; every request is recorded.
 */
export function createFakeProvider(
  respond: (request: StructuredRequest) => FakeBehaviour,
  model = 'fake-model',
  chat: (request: ChatRequest) => FakeChatBehaviour = () => ({ text: 'Fake answer.' }),
) {
  const requests: StructuredRequest[] = [];
  const chatRequests: ChatRequest[] = [];
  const usage = { inputTokens: 100, outputTokens: 20 };
  let calls = 0;

  const provider: AiProvider & { requests: StructuredRequest[]; chatRequests: ChatRequest[] } = {
    model,
    requests,
    chatRequests,
    async generateStructured(request): Promise<ProviderReply> {
      requests.push(request);
      const behaviour = respond(request);
      if ('error' in behaviour) throw new AiProviderError(behaviour.error, `fake ${behaviour.error}`);
      if ('refusal' in behaviour) return { kind: 'refusal', message: behaviour.refusal, usage };
      const text = 'rawText' in behaviour ? behaviour.rawText : JSON.stringify(behaviour.output);
      return { kind: 'output', text, usage };
    },

    async streamChat(request, onText): Promise<ChatStep> {
      // Copy the input: the caller keeps appending to its array.
      chatRequests.push({ ...request, input: [...request.input] });
      const behaviour = chat(request);
      if ('error' in behaviour) throw new AiProviderError(behaviour.error, `fake ${behaviour.error}`);
      if ('refusal' in behaviour) return { text: '', toolCalls: [], items: [], refusal: behaviour.refusal, usage };
      if ('toolCalls' in behaviour) {
        const toolCalls = behaviour.toolCalls.map((c) => ({ callId: `call_${++calls}`, name: c.name, arguments: JSON.stringify(c.arguments) }));
        return { text: '', toolCalls, items: toolCalls.map((c) => ({ type: 'provider', item: { type: 'function_call', ...c } })), refusal: null, usage };
      }
      // Stream in a few pieces, as the real API does.
      for (const piece of behaviour.text.match(/.{1,12}/gs) ?? []) onText(piece);
      return { text: behaviour.text, toolCalls: [], items: [], refusal: null, usage };
    },
  };
  return provider;
}
