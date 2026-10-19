import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppConfig } from '@houseplant/shared';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';
import { errorMessage } from '../lib/errors';
import { SectionHeading } from './CareGuide';
import { useToast } from './Toast';

type AiStatus = 'ready' | 'off' | 'notConfigured' | 'limitReached';

function statusOf(ai: AppConfig['ai']): AiStatus {
  if (!ai.configured) return 'notConfigured';
  if (!ai.enabled) return 'off';
  return ai.available ? 'ready' : 'limitReached';
}

const STATUS_STYLE: Record<AiStatus, string> = {
  ready: 'border-[#dde8dc] bg-[#eaf4e7] text-forest-2',
  off: 'border-line bg-[#f4f3ee] text-muted',
  notConfigured: 'border-line bg-[#f4f3ee] text-muted',
  limitReached: 'border-[#f0dcc0] bg-[#fdf3e3] text-[#8a5a14]',
};

/** Settings → AI: status, monthly usage, the owner's on/off switch and what leaves the PC. */
export function AiSettings() {
  const { t } = useTranslation();
  const toast = useToast();
  const config = useAsync(() => api.getConfig(), []);
  const [saving, setSaving] = useState(false);
  const ai = config.data?.ai;

  async function toggle() {
    if (!ai) return;
    setSaving(true);
    try {
      await api.updateSettings({ aiEnabled: !ai.enabled });
      config.reload();
    } catch (err) {
      toast(errorMessage(t, err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-7 rounded-2xl border border-line bg-white p-4" aria-labelledby="ai-settings">
      <div className="mb-3 flex items-center justify-between gap-3">
        <SectionHeading icon="sparkle" id="ai-settings">
          {t('settings.ai.title')}
        </SectionHeading>
        {ai && (
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${STATUS_STYLE[statusOf(ai)]}`}>
            {t(`settings.ai.status.${statusOf(ai)}`)}
          </span>
        )}
      </div>

      {config.error ? (
        <p className="text-xs text-muted">{t('settings.ai.loadFailed')}</p>
      ) : !ai ? (
        <p className="text-xs text-muted">{t('common.loading')}</p>
      ) : (
        <>
          {ai.configured ? (
            <dl className="mb-3 space-y-1.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t('settings.ai.usage')}</dt>
                <dd className="font-extrabold">{t('settings.ai.usageValue', { used: ai.usedThisMonth, limit: ai.monthlyLimit })}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t('settings.ai.model')}</dt>
                <dd className="font-mono" dir="ltr">
                  {ai.model}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mb-3 text-xs text-muted">{t('settings.ai.notConfiguredHint')}</p>
          )}
          <p className="text-[13px] leading-relaxed text-[#43584a]">{t('settings.ai.privacy')}</p>
          {ai.configured && (
            <button
              type="button"
              onClick={toggle}
              disabled={saving}
              aria-pressed={ai.enabled}
              className="mt-3 rounded-full border border-line px-3.5 py-2 text-xs font-extrabold text-forest-2 disabled:opacity-60"
            >
              {saving ? t('common.saving') : ai.enabled ? t('settings.ai.turnOff') : t('settings.ai.turnOn')}
            </button>
          )}
        </>
      )}
    </section>
  );
}
