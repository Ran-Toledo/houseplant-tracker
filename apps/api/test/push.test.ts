import type { PushPayload } from '@houseplant/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createCatalog } from '../src/catalog/loader';
import type { PushSender, PushTarget, SendResult } from '../src/push/sender';
import { makeSpecies } from './fixtures/species';
import { createTestApp, tempDir } from './helpers';

/** Records every message; `results` decides the outcome per endpoint. */
function stubSender(results: Record<string, SendResult> = {}) {
  const sent: { target: PushTarget; payload: PushPayload }[] = [];
  const sender: PushSender & { sent: typeof sent } = {
    publicKey: 'BPublicKeyForTests',
    sent,
    async send(target, payload) {
      sent.push({ target, payload });
      return results[target.endpoint] ?? { ok: true };
    },
  };
  return sender;
}

const device = (n: number, lang: 'en' | 'he' = 'en') => ({
  endpoint: `https://web.push.apple.com/device-${n}`,
  keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` },
  lang,
  userAgent: 'iPhone',
});

let clock: Date;
let sender: ReturnType<typeof stubSender>;
let t: ReturnType<typeof createTestApp>;

/** Creates a plant whose 3-day soil check is overdue on 2026-10-20. */
async function duePlant(nickname: string) {
  const id = (await t.json('POST', '/api/plants', { nickname })).body.plant.id;
  await t.json('PUT', `/api/plants/${id}/schedules/watering`, { enabled: true, mode: 'fixed', intervalDays: 3 });
  await t.json('POST', `/api/plants/${id}/activities`, { activityType: 'watering', performedAt: '2026-10-10T08:00:00Z' });
  return id;
}

beforeEach(() => {
  // 07:00 in Jerusalem (UTC+3 until 25 October).
  clock = new Date('2026-10-20T04:00:00Z');
  sender = stubSender();
  t = createTestApp({ pushSender: sender, now: () => clock });
});

describe('push devices API', () => {
  it('reports push as available with its public key', async () => {
    expect((await t.json('GET', '/api/config')).body.config.push).toEqual({ available: true, vapidPublicKey: 'BPublicKeyForTests', appUrl: null });
    const off = createTestApp();
    expect((await off.json('GET', '/api/config')).body.config.push).toEqual({ available: false, vapidPublicKey: null, appUrl: null });
    expect((await off.json('POST', '/api/push/subscriptions', device(1))).body.error.code).toBe('push_not_configured');
  });

  it('adds, refreshes, lists and removes devices', async () => {
    const first = (await t.json('POST', '/api/push/subscriptions', device(1))).body.device;
    expect(first).toMatchObject({ endpoint: device(1).endpoint, lang: 'en', userAgent: 'iPhone', lastSuccessAt: null });
    // The same endpoint again (e.g. after switching language) updates the device instead of adding one.
    const again = (await t.json('POST', '/api/push/subscriptions', { ...device(1), lang: 'he' })).body.device;
    expect(again).toMatchObject({ id: first.id, lang: 'he' });
    expect((await t.json('GET', '/api/push/subscriptions')).body.devices).toHaveLength(1);

    expect((await t.json('DELETE', `/api/push/subscriptions/${first.id}`)).status).toBe(204);
    expect((await t.json('DELETE', `/api/push/subscriptions/${first.id}`)).status).toBe(404);
  });

  it('validates subscriptions', async () => {
    expect((await t.json('POST', '/api/push/subscriptions', { ...device(1), endpoint: 'http://insecure.example/x' })).status).toBe(400);
    expect((await t.json('POST', '/api/push/subscriptions', { ...device(1), lang: 'fr' })).status).toBe(400);
  });

  it('sends a test message in each device’s language', async () => {
    expect((await t.json('POST', '/api/push/test')).body.error.code).toBe('no_push_devices');
    await t.json('POST', '/api/push/subscriptions', device(1));
    await t.json('POST', '/api/push/subscriptions', device(2, 'he'));
    expect((await t.json('POST', '/api/push/test')).body).toEqual({ sent: 2, failed: 0 });
    const bodies = Object.fromEntries(sender.sent.map((s) => [s.target.endpoint, s.payload.body]));
    expect(bodies[device(1).endpoint]).toContain('notifications work');
    expect(bodies[device(2).endpoint]).toContain('ההתראות עובדות');
  });
});

describe('daily digest', () => {
  beforeEach(async () => {
    await t.json('POST', '/api/push/subscriptions', device(1));
  });

  it('waits for the notification time, then sends once', async () => {
    await duePlant('Monty');
    expect(await t.app.push.tick()).toBe('not-due');
    clock = new Date('2026-10-20T05:29:00Z'); // 08:29
    expect(await t.app.push.tick()).toBe('not-due');
    clock = new Date('2026-10-20T05:30:00Z'); // 08:30
    expect(await t.app.push.tick()).toBe('sent');
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.payload).toMatchObject({ title: 'Houseplant Tracker', body: "Time to check Monty's soil", badge: 1, tag: 'daily-digest' });
    expect(sender.sent[0]!.payload.url).toMatch(/^\/plants\/[0-9a-f-]{36}$/);

    clock = new Date('2026-10-20T15:00:00Z');
    expect(await t.app.push.tick()).toBe('already-done');
    expect(sender.sent).toHaveLength(1);
    expect((await t.json('GET', '/api/push/status')).body.lastDigest).toEqual({
      digestDate: '2026-10-20',
      status: 'sent',
      plantCount: 1,
      sentAt: '2026-10-20T05:30:00.000Z',
    });
  });

  it('lists several plants, in the device’s language, and opens the Notifications page', async () => {
    await t.json('POST', '/api/push/subscriptions', device(1, 'he'));
    await duePlant('Monty');
    await duePlant('ציפורה');
    clock = new Date('2026-10-20T06:00:00Z');
    await t.app.push.tick();
    expect(sender.sent[0]!.payload).toMatchObject({ title: 'מעקב עציצים', url: '/notifications', badge: 2 });
    expect(sender.sent[0]!.payload.body).toMatch(/^2 צמחים לבדיקה היום: (Monty, ציפורה|ציפורה, Monty)$/);
  });

  it('never sends twice for a day, even after a restart', async () => {
    await duePlant('Monty');
    clock = new Date('2026-10-20T06:00:00Z');
    await t.app.push.tick();
    // A second app on the same database stands in for the restarted server.
    const restarted = createApp({
      catalog: createCatalog([makeSpecies()]),
      db: t.db,
      photosDir: tempDir(),
      maxUploadBytes: 1024 * 1024,
      pushSender: sender,
      now: () => clock,
      quiet: true,
    });
    expect(await restarted.push.tick()).toBe('already-done');
    expect(sender.sent).toHaveLength(1);
    expect(t.db.$client.prepare('select count(*) n from notifications').get()).toEqual({ n: 1 });
  });

  it('catches up later the same day when the server was off at notification time', async () => {
    await duePlant('Monty');
    clock = new Date('2026-10-20T17:45:00Z'); // 20:45
    expect(await t.app.push.tick()).toBe('sent');
  });

  it('follows the time zone across the end of daylight saving time', async () => {
    await duePlant('Monty');
    // 26 October: Jerusalem is back on UTC+2, so 08:30 is 06:30Z.
    clock = new Date('2026-10-26T05:30:00Z');
    expect(await t.app.push.tick()).toBe('not-due');
    clock = new Date('2026-10-26T06:30:00Z');
    expect(await t.app.push.tick()).toBe('sent');
  });

  it('records a quiet day without sending anything', async () => {
    clock = new Date('2026-10-20T06:00:00Z');
    expect(await t.app.push.tick()).toBe('skipped');
    expect(sender.sent).toEqual([]);
    expect((await t.json('GET', '/api/push/status')).body.lastDigest).toMatchObject({ status: 'skipped', plantCount: 0 });
  });

  it('stays silent during a vacation pause and resumes the day after', async () => {
    await duePlant('Monty');
    await t.json('PATCH', '/api/settings', { notificationsPausedUntil: '2026-10-21' });
    clock = new Date('2026-10-20T06:00:00Z');
    expect(await t.app.push.tick()).toBe('paused');
    clock = new Date('2026-10-21T06:00:00Z');
    expect(await t.app.push.tick()).toBe('paused');
    clock = new Date('2026-10-22T06:00:00Z');
    expect(await t.app.push.tick()).toBe('sent');
  });

  it('uses the configured notification time', async () => {
    await duePlant('Monty');
    await t.json('PATCH', '/api/settings', { notificationTime: '19:00' });
    clock = new Date('2026-10-20T15:59:00Z'); // 18:59
    expect(await t.app.push.tick()).toBe('not-due');
    clock = new Date('2026-10-20T16:00:00Z');
    expect(await t.app.push.tick()).toBe('sent');
  });

  it('waits for a device before claiming the day', async () => {
    const id = (await t.json('GET', '/api/push/subscriptions')).body.devices[0].id;
    await t.json('DELETE', `/api/push/subscriptions/${id}`);
    await duePlant('Monty');
    clock = new Date('2026-10-20T06:00:00Z');
    expect(await t.app.push.tick()).toBe('no-devices');
    await t.json('POST', '/api/push/subscriptions', device(3));
    expect(await t.app.push.tick()).toBe('sent');
  });

  it('removes devices the push service no longer knows, and marks the day failed when nobody got it', async () => {
    sender = stubSender({ [device(1).endpoint]: { ok: false, gone: true, message: '410 Gone' } });
    t = createTestApp({ pushSender: sender, now: () => clock });
    await t.json('POST', '/api/push/subscriptions', device(1));
    await duePlant('Monty');
    clock = new Date('2026-10-20T06:00:00Z');
    expect(await t.app.push.tick()).toBe('failed');
    expect((await t.json('GET', '/api/push/subscriptions')).body.devices).toEqual([]);
    expect((await t.json('GET', '/api/push/status')).body.lastDigest.status).toBe('failed');
  });

  it('keeps devices after a temporary failure and counts it', async () => {
    sender = stubSender({ [device(1).endpoint]: { ok: false, gone: false, message: '500' } });
    t = createTestApp({ pushSender: sender, now: () => clock });
    await t.json('POST', '/api/push/subscriptions', device(1));
    await t.json('POST', '/api/push/subscriptions', device(2));
    await duePlant('Monty');
    clock = new Date('2026-10-20T06:00:00Z');
    expect(await t.app.push.tick()).toBe('sent');
    const rows = t.db.$client.prepare('select endpoint, failure_count f, last_success_at s from push_subscriptions order by endpoint').all() as any[];
    expect(rows.map((r) => [r.f, r.s !== null])).toEqual([
      [1, false],
      [0, true],
    ]);
  });
});
