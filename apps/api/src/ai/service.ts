import { randomUUID } from 'node:crypto';
import type { AppConfig } from '@houseplant/shared';
import type { z } from 'zod';
import type { AI_REQUEST_KINDS, AI_REQUEST_STATUSES } from '../db/schema';
import { startOfLocalMonth } from '../lib/zoned-time';
import { ApiError } from '../middleware/errors';
import type { AiRequestRepository } from '../repositories/ai-requests';
import type { SettingsService } from '../services/settings';
import { AiProviderError, type AiProvider, type AiUsage, type ChatRequest, type ChatStep, type StructuredRequest } from './provider';

type Kind = (typeof AI_REQUEST_KINDS)[number];
type Status = (typeof AI_REQUEST_STATUSES)[number];

interface Deps {
  /** Null when no API key is configured. */
  provider: AiProvider | null;
  settings: SettingsService;
  requests: AiRequestRepository;
  now?: () => Date;
}

export interface RequestContext {
  kind: Kind;
  plantId?: string | null;
  photoId?: string | null;
}

/**
 * The single entry point for model calls. It enforces the owner's switch and
 * the monthly limit, validates the answer against the request's schema, and
 * logs every call (whatever the outcome) in `ai_requests`.
 */
export function createAiService({ provider, settings, requests, now = () => new Date() }: Deps) {
  function usedThisMonth(timezone: string): number {
    return requests.countSince(startOfLocalMonth(now(), timezone).toISOString());
  }

  function status(): AppConfig['ai'] {
    const s = settings.get();
    const used = usedThisMonth(s.timezone);
    return {
      configured: provider !== null,
      enabled: s.aiEnabled,
      available: provider !== null && s.aiEnabled && used < s.aiMonthlyRequestLimit,
      model: provider?.model ?? null,
      usedThisMonth: used,
      monthlyLimit: s.aiMonthlyRequestLimit,
    };
  }

  function assertAvailable(): AiProvider {
    if (!provider) throw new ApiError(503, 'ai_not_configured', 'AI features are not set up: no OpenAI API key is configured');
    const s = settings.get();
    if (!s.aiEnabled) throw new ApiError(503, 'ai_disabled', 'AI features are turned off in Settings');
    if (usedThisMonth(s.timezone) >= s.aiMonthlyRequestLimit) {
      throw new ApiError(429, 'ai_limit_reached', `The monthly limit of ${s.aiMonthlyRequestLimit} AI requests has been reached`);
    }
    return provider;
  }

  /** Inserts the `ai_requests` row for one call. */
  function logger(context: RequestContext, model: string, started: number, requestId: string) {
    return (status: Status, usage: AiUsage | null, extra: { errorCode?: string; result?: unknown } = {}) =>
      requests.insert({
        id: requestId,
        kind: context.kind,
        plantId: context.plantId ?? null,
        photoId: context.photoId ?? null,
        model,
        status,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        latencyMs: now().getTime() - started,
        errorCode: extra.errorCode ?? null,
        resultJson: extra.result === undefined ? null : JSON.stringify(extra.result),
        createdAt: new Date(started).toISOString(),
      });
  }

  /** Logs a failed call and turns it into the matching `ApiError`. */
  function failure(err: unknown, context: RequestContext, log: ReturnType<typeof logger>): never {
    if (!(err instanceof AiProviderError)) throw err;
    log(err.code === 'timeout' ? 'timeout' : 'error', null, { errorCode: err.code });
    console.error(`[api] AI ${context.kind} request failed: ${err.message}`);
    if (err.code === 'timeout') throw new ApiError(504, 'ai_timeout', 'The AI service took too long to answer. Try again.');
    throw new ApiError(502, 'ai_error', 'The AI service could not be reached. Try again later.');
  }

  return {
    status,

    /** Throws the `ApiError` a request would get right now, if AI can't be used. */
    ensureAvailable(): void {
      assertAvailable();
    },

    /**
     * One streamed chat step (a single model call, logged like any other).
     * Returns the step with its request id, or throws an `ApiError`.
     */
    async chatStep(context: RequestContext, request: ChatRequest, onText: (delta: string) => void): Promise<ChatStep & { requestId: string }> {
      const active = assertAvailable();
      const started = now().getTime();
      const requestId = randomUUID();
      const log = logger(context, active.model, started, requestId);
      let step: ChatStep;
      try {
        step = await active.streamChat(request, onText);
      } catch (err) {
        failure(err, context, log);
      }
      if (step.refusal) {
        log('refused', step.usage, { errorCode: 'refusal' });
        throw new ApiError(422, 'ai_refused', 'The AI service declined to answer this request.');
      }
      log('ok', step.usage);
      return { ...step, requestId };
    },

    /**
     * Sends a structured request and returns the validated answer with the id of
     * its `ai_requests` row, or throws an `ApiError`.
     */
    async generate<S extends z.ZodType>(
      context: RequestContext,
      request: StructuredRequest<S>,
    ): Promise<{ data: z.output<S>; requestId: string }> {
      const active = assertAvailable();
      const started = now().getTime();
      const requestId = randomUUID();
      const log = logger(context, active.model, started, requestId);

      let reply;
      try {
        reply = await active.generateStructured(request);
      } catch (err) {
        failure(err, context, log);
      }

      if (reply.kind === 'refusal') {
        log('refused', reply.usage, { errorCode: 'refusal' });
        throw new ApiError(422, 'ai_refused', 'The AI service declined to answer this request.');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(reply.text);
      } catch {
        parsed = undefined;
      }
      const result = request.schema.safeParse(parsed);
      if (!result.success) {
        log('invalid-output', reply.usage, { errorCode: 'schema' });
        throw new ApiError(502, 'ai_invalid_output', 'The AI service returned an answer that could not be used. Try again.');
      }
      log('ok', reply.usage, { result: result.data });
      return { data: result.data, requestId };
    },
  };
}

export type AiService = ReturnType<typeof createAiService>;
