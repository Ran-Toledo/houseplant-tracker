import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { PushDevice } from '@houseplant/shared';
import { AppRoutes } from '../App';
import { ToastProvider } from '../components/Toast';
import { mockApi, species } from '../test/mockApi';

const ENDPOINT = 'https://web.push.apple.com/this-device';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const settings = {
  timezone: 'Asia/Jerusalem',
  hemisphere: 'north',
  aiEnabled: true,
  aiMonthlyRequestLimit: 300,
  notificationTime: '08:30',
  notificationsPausedUntil: null,
};

const config = (push: Partial<{ available: boolean; appUrl: string | null }> = {}) => ({
  config: {
    ai: { configured: false, enabled: true, available: false, model: null, usedThisMonth: 0, monthlyLimit: 300 },
    push: { available: true, vapidPublicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', appUrl: null, ...push },
    timezone: 'Asia/Jerusalem',
  },
});

const device = (endpoint = ENDPOINT): PushDevice => ({
  id: 'd1',
  endpoint,
  lang: 'en',
  userAgent: IPHONE,
  createdAt: '2026-10-20T06:00:00.000Z',
  lastSuccessAt: null,
});

const restore: (() => void)[] = [];
/** Overrides a global for one test. */
function stub(target: object, key: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
  restore.push(() => (previous ? Object.defineProperty(target, key, previous) : delete (target as Record<string, unknown>)[key]));
}
afterEach(() => {
  for (const undo of restore.splice(0).reverse()) undo();
});

/** A browser that supports Web Push; `subscribed` decides whether it already has a subscription. */
function supportPush({ subscribed = false, permission = 'default' as NotificationPermission } = {}) {
  let subscription: object | null = subscribed ? fakeSubscription() : null;
  const registration = {
    pushManager: {
      getSubscription: async () => subscription,
      subscribe: async () => (subscription = fakeSubscription()),
    },
  };
  stub(window, 'isSecureContext', true);
  stub(window, 'PushManager', function PushManager() {});
  stub(window, 'Notification', { permission, requestPermission: async () => 'granted' });
  stub(navigator, 'serviceWorker', {
    getRegistration: async () => registration,
    register: async () => registration,
    ready: Promise.resolve(registration),
  });
}

function fakeSubscription() {
  return {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p256', auth: 'auth' } }),
    unsubscribe: async () => true,
  };
}

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const base = (extra: Record<string, (url: URL, init: RequestInit) => unknown> = {}) => ({
  'GET /api/species': () => ({ species }),
  'GET /api/config': () => config(),
  'GET /api/settings': () => ({ settings }),
  'GET /api/push/status': () => ({ lastDigest: null }),
  'GET /api/push/subscriptions': () => ({ devices: [] }),
  ...extra,
});

describe('settings: notifications', () => {
  it('says when push isn’t set up on the computer', async () => {
    mockApi(base({ 'GET /api/config': () => config({ available: false }) }));
    renderSettings();
    expect(await screen.findByText(/Push notifications aren't set up on this computer yet/)).toBeTruthy();
  });

  it('explains how to reach the secure address when opened over plain http', async () => {
    stub(window, 'isSecureContext', false);
    mockApi(base({ 'GET /api/config': () => config({ appUrl: 'https://my-pc.tailnet.ts.net' }) }));
    renderSettings();
    expect(await screen.findByText('https://my-pc.tailnet.ts.net')).toBeTruthy();
    expect(screen.getByText('On the iPhone, open the Tailscale app and connect.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enable notifications on this device' })).toBeNull();
  });

  it('asks iPhone Safari to add the app to the Home Screen first', async () => {
    stub(window, 'isSecureContext', true);
    stub(navigator, 'userAgent', IPHONE);
    mockApi(base());
    renderSettings();
    expect(await screen.findByText(/Tap Share → Add to Home Screen/)).toBeTruthy();
    expect(screen.queryByText('On the iPhone, open the Tailscale app and connect.')).toBeNull();
  });

  it('explains how to unblock notifications after a refusal', async () => {
    supportPush({ permission: 'denied' });
    mockApi(base());
    renderSettings();
    expect(await screen.findByText(/Notifications are blocked for this app/)).toBeTruthy();
  });

  it('subscribes this device, then shows the daily controls and sends a test', async () => {
    supportPush();
    const posts: Record<string, unknown> = {};
    let devices: PushDevice[] = [];
    mockApi(
      base({
        'GET /api/push/subscriptions': () => ({ devices }),
        'POST /api/push/subscriptions': (_url, init) => {
          posts.subscribe = JSON.parse(String(init.body));
          devices = [device()];
          return { device: devices[0] };
        },
        'POST /api/push/test': () => {
          posts.test = true;
          return { sent: 1, failed: 0 };
        },
      }),
    );
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Enable notifications on this device' }));

    expect(await screen.findByText('(this device)')).toBeTruthy();
    expect(posts.subscribe).toMatchObject({ endpoint: ENDPOINT, keys: { p256dh: 'p256', auth: 'auth' }, lang: 'en' });
    expect(screen.getByText('On')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enable notifications on this device' })).toBeNull();
    expect(((await screen.findByLabelText('Daily time')) as HTMLInputElement).value).toBe('08:30');
    expect(screen.getByText('No notification sent yet.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Send a test' }));
    expect(await screen.findByText('Test notification sent')).toBeTruthy();
    expect(posts.test).toBe(true);
  });

  it('saves the daily time and a vacation pause', async () => {
    supportPush({ subscribed: true });
    const patches: unknown[] = [];
    mockApi(
      base({
        'GET /api/push/subscriptions': () => ({ devices: [device()] }),
        'GET /api/push/status': () => ({ lastDigest: { digestDate: '2026-10-20', status: 'sent', plantCount: 2, sentAt: '2026-10-20T05:30:00.000Z' } }),
        'PATCH /api/settings': (_url, init) => {
          const body = JSON.parse(String(init.body));
          patches.push(body);
          return { settings: { ...settings, ...body } };
        },
      }),
    );
    renderSettings();
    expect(await screen.findByText(/Last notification: .* · 2 plants/)).toBeTruthy();
    fireEvent.change(await screen.findByLabelText('Daily time'), { target: { value: '19:15' } });
    fireEvent.change(screen.getByLabelText('Pause until (vacation)'), { target: { value: '2026-11-02' } });
    await waitFor(() => expect(patches).toEqual([{ notificationTime: '19:15' }, { notificationsPausedUntil: '2026-11-02' }]));
    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(patches.at(-1)).toEqual({ notificationsPausedUntil: null }));
  });
});
