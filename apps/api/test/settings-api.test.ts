import { DEFAULT_SETTINGS } from '@houseplant/shared';
import { describe, expect, it } from 'vitest';
import { createFakeProvider } from '../src/ai/fake-provider';
import { createTestApp } from './helpers';

describe('settings API', () => {
  it('returns the defaults until something is changed', async () => {
    const t = createTestApp();
    const res = await t.json('GET', '/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual(DEFAULT_SETTINGS);
    expect(res.body.settings).toMatchObject({ timezone: 'Asia/Jerusalem', hemisphere: 'north', notificationTime: '08:30' });
  });

  it('updates only the given settings and keeps them', async () => {
    const t = createTestApp();
    const res = await t.json('PATCH', '/api/settings', { notificationTime: '07:15', aiMonthlyRequestLimit: 50 });
    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual({ ...DEFAULT_SETTINGS, notificationTime: '07:15', aiMonthlyRequestLimit: 50 });
    expect((await t.json('GET', '/api/settings')).body.settings.notificationTime).toBe('07:15');
  });

  it('rejects invalid values with field details', async () => {
    const t = createTestApp();
    const res = await t.json('PATCH', '/api/settings', { timezone: 'Mars/Olympus', notificationTime: '25:00' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(['notificationTime', 'timezone']);
    expect((await t.json('PATCH', '/api/settings', {})).status).toBe(400);
    expect((await t.json('PATCH', '/api/settings', { unknownSetting: true })).status).toBe(400);
  });

  it('falls back to the default when a stored value is no longer valid', async () => {
    const t = createTestApp();
    t.db.$client.prepare("insert into settings (key, value, updated_at) values ('hemisphere', '\"east\"', 'x')").run();
    expect((await t.json('GET', '/api/settings')).body.settings.hemisphere).toBe('north');
  });
});

describe('config API', () => {
  it('reports AI as not configured when there is no provider', async () => {
    const t = createTestApp();
    const res = await t.json('GET', '/api/config');
    expect(res.status).toBe(200);
    expect(res.body.config).toEqual({
      ai: { configured: false, enabled: true, available: false, model: null, usedThisMonth: 0, monthlyLimit: 300 },
      push: { available: false, vapidPublicKey: null },
      timezone: 'Asia/Jerusalem',
    });
  });

  it('reports AI as available with a provider, and unavailable when switched off', async () => {
    const t = createTestApp({ aiProvider: createFakeProvider(() => ({ output: {} })) });
    expect((await t.json('GET', '/api/config')).body.config.ai).toMatchObject({ configured: true, available: true, model: 'fake-model' });
    await t.json('PATCH', '/api/settings', { aiEnabled: false });
    expect((await t.json('GET', '/api/config')).body.config.ai).toMatchObject({ configured: true, enabled: false, available: false });
  });
});
