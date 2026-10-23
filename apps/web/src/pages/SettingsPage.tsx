import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { AiSettings } from '../components/AiSettings';
import { PushSettings } from '../components/PushSettings';
import { useAsync } from '../hooks/useAsync';
import { SectionHeading } from '../components/CareGuide';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useSpeciesCatalog } from '../hooks/useSpecies';

export function SettingsPage() {
  const { t } = useTranslation();
  const catalog = useSpeciesCatalog();
  const config = useAsync(() => api.getConfig(), []);
  return (
    <>
      <h1 className="mb-6 text-[37px] leading-[1.08] font-extrabold tracking-[-.02em]">{t('settings.title')}</h1>

      <section className="mb-7 rounded-2xl border border-line bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <SectionHeading icon="globe">{t('settings.language')}</SectionHeading>
          <LanguageSwitcher />
        </div>
        <p className="text-xs text-muted">{t('settings.languageHint')}</p>
      </section>

      <AiSettings />

      {config.data && <PushSettings push={config.data.push} />}

      <section className="rounded-2xl border border-line bg-white p-4">
        <div className="mb-3">
          <SectionHeading icon="info">{t('settings.about')}</SectionHeading>
        </div>
        <p className="text-[13px] leading-relaxed text-[#43584a]">{t('settings.aboutBody')}</p>
        <dl className="mt-3 flex justify-between border-t border-line-soft pt-3 text-xs">
          <dt className="text-muted">{t('settings.catalog')}</dt>
          <dd className="font-extrabold">{catalog.species.length || '—'}</dd>
        </dl>
      </section>
    </>
  );
}
