import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { NeedsCareStrip } from '../components/NeedsCareStrip';

/** Opened from the bell on My plants: everything that currently asks for attention. */
export function NotificationsPage() {
  const { t } = useTranslation();
  return (
    <>
      <div className="-mt-1.5 mb-[15px] flex items-center">
        <Link to="/" className="flex min-h-10 items-center gap-1.5 text-xs font-extrabold text-forest">
          <Icon name="back" className="size-[19px]" flipRtl />
          {t('details.back')}
        </Link>
      </div>
      <h1 className="mb-6 text-[37px] leading-[1.08] font-extrabold tracking-[-.02em]">{t('notifications.title')}</h1>
      <NeedsCareStrip showEmpty />
    </>
  );
}
