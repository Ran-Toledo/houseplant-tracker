import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { createFakeProvider, type FakeBehaviour } from '../src/ai/fake-provider';
import { createAiService } from '../src/ai/service';
import { openDatabase } from '../src/db/client';
import { ApiError } from '../src/middleware/errors';
import { createAiRequestRepository } from '../src/repositories/ai-requests';
import { createSettingsRepository } from '../src/repositories/settings';
import { createSettingsService } from '../src/services/settings';

const answerSchema = z.strictObject({ ok: z.boolean(), note: z.string() });
const request = {
  instructions: 'test',
  input: [{ type: 'text' as const, text: 'hello' }],
  schema: answerSchema,
  schemaName: 'answer',
};

function setup(behaviour: FakeBehaviour | null, now = () => new Date('2026-10-19T09:00:00Z')) {
  const db = openDatabase(':memory:');
  const settings = createSettingsService(createSettingsRepository(db));
  const provider = behaviour ? createFakeProvider(() => behaviour) : null;
  const ai = createAiService({ provider, settings, requests: createAiRequestRepository(db), now });
  const logged = () =>
    db.$client.prepare('select kind, status, error_code, result_json, input_tokens from ai_requests').all() as {
      kind: string;
      status: string;
      error_code: string | null;
      result_json: string | null;
      input_tokens: number | null;
    }[];
  return { db, settings, provider, ai, logged };
}

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  return err as ApiError;
}

describe('AI service', () => {
  it('returns the validated answer and logs the request', async () => {
    const t = setup({ output: { ok: true, note: 'fine' } });
    expect(await t.ai.generate({ kind: 'check' }, request)).toEqual({ ok: true, note: 'fine' });
    expect(t.logged()).toEqual([
      { kind: 'check', status: 'ok', error_code: null, result_json: '{"ok":true,"note":"fine"}', input_tokens: 100 },
    ]);
    expect(t.provider!.requests[0]?.schemaName).toBe('answer');
  });

  it('rejects answers that do not match the schema', async () => {
    for (const behaviour of [{ output: { ok: 'yes' } }, { rawText: 'not json' }] satisfies FakeBehaviour[]) {
      const t = setup(behaviour);
      const err = await apiError(t.ai.generate({ kind: 'check' }, request));
      expect([err.status, err.code]).toEqual([502, 'ai_invalid_output']);
      expect(t.logged()[0]).toMatchObject({ status: 'invalid-output', result_json: null });
    }
  });

  it('maps refusals, timeouts and provider errors to API errors', async () => {
    const cases: [FakeBehaviour, number, string, string][] = [
      [{ refusal: 'no' }, 422, 'ai_refused', 'refused'],
      [{ error: 'timeout' }, 504, 'ai_timeout', 'timeout'],
      [{ error: 'auth' }, 502, 'ai_error', 'error'],
      [{ error: 'rate-limit' }, 502, 'ai_error', 'error'],
    ];
    for (const [behaviour, status, code, logged] of cases) {
      const t = setup(behaviour);
      const err = await apiError(t.ai.generate({ kind: 'check' }, request));
      expect([err.status, err.code]).toEqual([status, code]);
      expect(t.logged()[0]?.status).toBe(logged);
    }
  });

  it('refuses without calling the provider when not configured or switched off', async () => {
    const none = setup(null);
    expect((await apiError(none.ai.generate({ kind: 'check' }, request))).code).toBe('ai_not_configured');
    expect(none.logged()).toEqual([]);

    const off = setup({ output: { ok: true, note: '' } });
    off.settings.update({ aiEnabled: false });
    expect((await apiError(off.ai.generate({ kind: 'check' }, request))).code).toBe('ai_disabled');
    expect(off.provider!.requests).toHaveLength(0);
  });

  it('enforces the monthly limit, counting every outcome', async () => {
    const t = setup({ refusal: 'no' });
    t.settings.update({ aiMonthlyRequestLimit: 2 });
    await t.ai.generate({ kind: 'check' }, request).catch(() => {});
    await t.ai.generate({ kind: 'check' }, request).catch(() => {});
    const err = await apiError(t.ai.generate({ kind: 'check' }, request));
    expect([err.status, err.code]).toEqual([429, 'ai_limit_reached']);
    expect(t.provider!.requests).toHaveLength(2);
    expect(t.ai.status()).toMatchObject({ usedThisMonth: 2, monthlyLimit: 2, available: false });
  });

  it('counts the month in the owner’s time zone', async () => {
    // 2026-09-30T22:00Z is 01:00 on 1 October in Jerusalem, so it counts towards October there.
    let clock = new Date('2026-09-30T22:00:00Z');
    const t = setup({ output: { ok: true, note: '' } }, () => clock);
    await t.ai.generate({ kind: 'check' }, request);
    clock = new Date('2026-10-15T12:00:00Z');
    expect(t.ai.status().usedThisMonth).toBe(1);

    // Under UTC the same request belongs to September.
    t.settings.update({ timezone: 'UTC' });
    expect(t.ai.status().usedThisMonth).toBe(0);
  });

  it('records the plant and photo a request was about', async () => {
    const t = setup({ output: { ok: true, note: '' } });
    // Unknown ids would violate the foreign keys, so only check that nulls are stored by default.
    await t.ai.generate({ kind: 'health' }, request);
    expect(t.db.$client.prepare('select plant_id, photo_id from ai_requests').get()).toEqual({ plant_id: null, photo_id: null });
  });
});
