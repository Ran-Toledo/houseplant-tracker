import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../components/StatusViews';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t('errors.pageNotFound')}
      body={t('errors.pageNotFoundBody')}
      action={
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-xl bg-forest-2 px-5 font-extrabold text-white hover:bg-forest"
        >
          {t('errors.goHome')}
        </Link>
      }
    />
  );
}
