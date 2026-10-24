import {
  AiProviderError,
  type AiProvider,
  type ChatRequest,
  type ChatStep,
  type EmbedReply,
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

/** What the fake should do for one embedding request. */
export type FakeEmbedBehaviour = { vectors: number[][] } | { error: ProviderErrorCode };

const FAKE_DIMENSIONS = 256;

/**
 * A deterministic stand-in for a real embedding: words hashed into buckets,
 * normalized. Texts sharing words score higher, which is enough to test ranking.
 */
export function fakeEmbedding(text: string): number[] {
  const vector = new Array<number>(FAKE_DIMENSIONS).fill(0);
  for (const word of text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    let hash = 0;
    for (const char of word) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
    vector[hash % FAKE_DIMENSIONS]! += 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((v) => v / norm);
}

/**
 * In-memory provider for tests: never touches the network. `respond` decides
 * the reply per request, `chat` per chat step and `embedding` per embedding
 * request; every request is recorded.
 */
export function createFakeProvider(
  respond: (request: StructuredRequest) => FakeBehaviour,
  model = 'fake-model',
  chat: (request: ChatRequest) => FakeChatBehaviour = () => ({ text: 'Fake answer.' }),
  embedding: (inputs: string[]) => FakeEmbedBehaviour = (inputs) => ({ vectors: inputs.map(fakeEmbedding) }),
) {
  const requests: StructuredRequest[] = [];
  const chatRequests: ChatRequest[] = [];
  const embedRequests: string[][] = [];
  const usage = { inputTokens: 100, outputTokens: 20 };
  let calls = 0;

  const provider: AiProvider & { requests: StructuredRequest[]; chatRequests: ChatRequest[]; embedRequests: string[][] } = {
    model,
    embeddingModel: 'fake-embedding',
    requests,
    chatRequests,
    embedRequests,

    async embed(inputs): Promise<EmbedReply> {
      embedRequests.push([...inputs]);
      const behaviour = embedding(inputs);
      if ('error' in behaviour) throw new AiProviderError(behaviour.error, `fake ${behaviour.error}`);
      return { vectors: behaviour.vectors, usage: { inputTokens: inputs.length * 10, outputTokens: null } };
    },

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
