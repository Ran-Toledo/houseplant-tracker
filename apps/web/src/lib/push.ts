import type { Language, PushDevice } from '@houseplant/shared';
import { api } from '../api';

/** What this browser can do about push notifications. */
export type PushSupport =
  /** Not HTTPS (e.g. opened by LAN address): push needs the secure address. */
  | 'insecure'
  /** iPhone/iPad Safari: push only works in the app added to the Home Screen. */
  | 'needs-install'
  /** The browser has no Web Push. */
  | 'unsupported'
  /** Permission was refused; only the device's settings can change that. */
  | 'denied'
  | 'ready';

const isAppleMobile = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  if (!window.isSecureContext) return 'insecure';
  if (isAppleMobile() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ready';
}

/** Registers the service worker in the production build (secure pages only). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch((err: unknown) => console.warn('Service worker registration failed', err));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register('/sw.js');
}

/** This browser's current push subscription endpoint, if it has one. */
export async function currentEndpoint(): Promise<string | null> {
  if (pushSupport() !== 'ready') return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription())?.endpoint ?? null;
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Asks for permission, subscribes this browser and registers it with the server. */
export async function enablePush(publicKey: string, lang: Language): Promise<PushDevice | 'denied'> {
  // Safari only shows the permission prompt in direct response to a tap, so ask first.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  return api.addPushDevice({ endpoint: json.endpoint, keys: json.keys, lang, userAgent: navigator.userAgent.slice(0, 500) });
}

/** Removes a device; when it's this browser, also drops the browser's subscription. */
export async function removePushDevice(device: PushDevice): Promise<void> {
  if (device.endpoint === (await currentEndpoint())) {
    const reg = await navigator.serviceWorker.getRegistration();
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  }
  await api.removePushDevice(device.id);
}

/** Mirrors the due count on the Home Screen icon, where supported. */
export function setAppBadge(count: number): void {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (!nav.setAppBadge || !nav.clearAppBadge) return;
  (count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge()).catch(() => {});
}
