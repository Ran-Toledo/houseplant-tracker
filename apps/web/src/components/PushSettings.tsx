import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { AppConfig, AppSettings, DigestInfo, PushDevice } from '@houseplant/shared';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';
import { errorMessage } from '../lib/errors';
import { formatDate } from '../lib/format';
import { currentEndpoint, enablePush, pushSupport, removePushDevice } from '../lib/push';
import { SectionHeading } from './CareGuide';
import { Icon } from './Icon';
import { useToast } from './Toast';

function Note({ children }: { children: string }) {
  return (
    <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted">
      <Icon name="info" className="mt-px size-3.5" />
      {children}
    </p>
  );
}

/** Why push can't be used here, with the steps that fix it (Screen E1). */
function SetupSteps({ support, appUrl }: { support: 'insecure' | 'needs-install'; appUrl: string | null }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-[13px] text-[#43584a]">{t('settings.push.insecureIntro')}</p>
      <ol className="mt-2.5 list-decimal space-y-1.5 ps-5 text-[13px] text-[#385340]">
        {support === 'insecure' && (
          <>
            <li>{t('settings.push.stepTailscale')}</li>
            <li>
              {appUrl ? (
                <>
                  {t('settings.push.stepOpen')}{' '}
                  <code dir="ltr" className="rounded-md bg-[#f5f7f2] px-1.5 py-0.5 text-xs break-all">
                    {appUrl}
                  </code>
                </>
              ) : (
                t('settings.push.stepOpenGeneric')
              )}
            </li>
          </>
        )}
        <li>{t('settings.push.stepInstall')}</li>
      </ol>
      <Note>{t('settings.push.inAppNote')}</Note>
    </>
  );
}

function lastDigestText(t: TFunction, lang: string, digest: DigestInfo | null): string {
  if (!digest) return t('settings.push.never');
  const date = formatDate(digest.sentAt, lang);
  if (digest.status === 'skipped') return t('settings.push.lastSkipped', { date });
  if (digest.status === 'failed') return t('settings.push.lastFailed', { date });
  return t('settings.push.lastSent', { date, count: digest.plantCount });
}

/** Time, vacation pause, last digest, test button and devices (Screen E3). */
function EnabledControls({
  devices,
  thisEndpoint,
  onDevicesChanged,
}: {
  devices: PushDevice[];
  thisEndpoint: string | null;
  onDevicesChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const settings = useAsync(() => api.getSettings(), []);
  const status = useAsync(() => api.getPushStatus(), []);
  const [testing, setTesting] = useState(false);

  async function save(changes: Partial<AppSettings>) {
    try {
      settings.setData(await api.updateSettings(changes));
      toast(t('settings.push.saved'));
    } catch (err) {
      toast(errorMessage(t, err));
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const result = await api.sendTestPush();
      toast(result.sent > 0 ? t('settings.push.testSent') : t('settings.push.testFailed'));
      onDevicesChanged();
    } catch (err) {
      toast(errorMessage(t, err));
    } finally {
      setTesting(false);
    }
  }

  async function remove(device: PushDevice) {
    try {
      await removePushDevice(device);
      toast(t('settings.push.removed'));
      onDevicesChanged();
    } catch (err) {
      toast(errorMessage(t, err));
    }
  }

  const s = settings.data;
  const fieldClass = 'min-h-10 rounded-[10px] border border-line bg-white px-2.5 text-ink outline-none focus:border-[#83b998]';
  return (
    <div className="text-[13px]">
      {s && (
        <>
          <label className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-xs font-extrabold text-[#55695b]">{t('settings.push.time')}</span>
            <input
              type="time"
              value={s.notificationTime}
              onChange={(e) => e.target.value && void save({ notificationTime: e.target.value })}
              className={fieldClass}
            />
          </label>
          <div className="flex items-center justify-between gap-3 border-t border-[#eff1e9] py-2.5">
            <label htmlFor="push-pause" className="text-xs font-extrabold text-[#55695b]">
              {t('settings.push.pause')}
            </label>
            <span className="flex items-center gap-2">
              <input
                id="push-pause"
                type="date"
                value={s.notificationsPausedUntil ?? ''}
                onChange={(e) => void save({ notificationsPausedUntil: e.target.value || null })}
                className={fieldClass}
              />
              {s.notificationsPausedUntil && (
                <button type="button" onClick={() => void save({ notificationsPausedUntil: null })} className="text-xs font-bold text-forest hover:underline">
                  {t('settings.push.clearPause')}
                </button>
              )}
            </span>
          </div>
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eff1e9] py-2.5">
        <span className="text-[#43584a]">{status.data !== undefined && lastDigestText(t, i18n.language, status.data)}</span>
        <button
          type="button"
          onClick={() => void sendTest()}
          disabled={testing}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-xs font-extrabold text-forest hover:bg-sage disabled:opacity-60"
        >
          <Icon name="send" className="size-3.5" flipRtl />
          {t('settings.push.test')}
        </button>
      </div>

      <p className="mt-3 mb-0.5 text-[11px] font-extrabold tracking-[.08em] text-muted uppercase rtl:tracking-normal rtl:normal-case">
        {t('settings.push.devices')}
      </p>
      <ul>
        {devices.map((d) => (
          <li key={d.id} className="flex items-center gap-2.5 border-t border-[#eff1e9] py-2.5 first:border-t-0">
            <Icon name="bell" className="size-[18px] text-forest-2" />
            <span className="min-w-0">
              <span className="block truncate">
                {deviceName(d.userAgent) ?? t('settings.push.device')}
                {d.endpoint === thisEndpoint && <span className="text-muted"> ({t('settings.push.thisDevice')})</span>}
              </span>
              <span className="block text-[11px] text-muted">{t('settings.push.added', { date: formatDate(d.createdAt, i18n.language) })}</span>
            </span>
            <button type="button" onClick={() => void remove(d)} className="ms-auto text-xs font-extrabold text-clay-ink hover:underline">
              {t('settings.push.remove')}
            </button>
          </li>
        ))}
      </ul>
      <Note>{t('settings.push.langNote')}</Note>
    </div>
  );
}

/** A short name for a device from its user agent. */
function deviceName(userAgent: string | null): string | null {
  if (!userAgent) return null;
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Macintosh/.test(userAgent)) return 'Mac';
  if (/Windows/.test(userAgent)) return 'Windows';
  return null;
}

/** Settings → Notifications: daily Web Push digest (Screen E). */
export function PushSettings({ push }: { push: AppConfig['push'] }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [support, setSupport] = useState(pushSupport);
  const devices = useAsync(() => (push.available ? api.listPushDevices() : Promise.resolve([])), [push.available]);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    void currentEndpoint().then(setThisEndpoint, () => setThisEndpoint(null));
  }, [devices.data]);

  async function enable() {
    if (!push.vapidPublicKey) return;
    setEnabling(true);
    try {
      const result = await enablePush(push.vapidPublicKey, i18n.resolvedLanguage === 'he' ? 'he' : 'en');
      if (result === 'denied') setSupport(pushSupport());
      else {
        toast(t('settings.push.enabled'));
        devices.reload();
      }
    } catch (err) {
      toast(errorMessage(t, err));
    } finally {
      setEnabling(false);
    }
  }

  const list = devices.data ?? [];
  const subscribedHere = thisEndpoint !== null && list.some((d) => d.endpoint === thisEndpoint);
  const on = list.length > 0;

  return (
    <section className="mb-7 rounded-2xl border border-line bg-white p-4" aria-labelledby="push-settings">
      <div className="mb-3 flex items-center justify-between gap-3">
        <SectionHeading icon="bell" id="push-settings">
          {t('settings.push.title')}
        </SectionHeading>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${
            on ? 'border-[#dde8dc] bg-[#eaf4e7] text-forest-2' : 'border-line bg-[#f4f3ee] text-muted'
          }`}
        >
          {on ? t('settings.push.on') : t('settings.push.off')}
        </span>
      </div>

      {!push.available ? (
        <p className="text-[13px] text-muted">{t('settings.push.notConfigured')}</p>
      ) : (
        <>
          {support === 'insecure' || support === 'needs-install' ? (
            <SetupSteps support={support} appUrl={push.appUrl} />
          ) : support === 'unsupported' ? (
            <p className="text-[13px] text-muted">{t('settings.push.unsupported')}</p>
          ) : support === 'denied' ? (
            <p className="text-[13px] text-clay-ink">{t('settings.push.denied')}</p>
          ) : (
            !subscribedHere && (
              <>
                <p className="text-[13px] text-[#43584a]">{t('settings.push.intro')}</p>
                <button
                  type="button"
                  onClick={() => void enable()}
                  disabled={enabling}
                  className="mt-3 min-h-[46px] w-full rounded-xl bg-forest-2 text-sm font-extrabold text-white hover:bg-forest disabled:opacity-70"
                >
                  {enabling ? t('settings.push.enabling') : t('settings.push.enable')}
                </button>
                <Note>{t('settings.push.permissionNote')}</Note>
              </>
            )
          )}
          {on && (
            <div className={support === 'ready' && !subscribedHere ? 'mt-4 border-t border-line pt-1' : 'mt-1'}>
              <EnabledControls devices={list} thisEndpoint={thisEndpoint} onDevicesChanged={devices.reload} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
