import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../lib/errors';
import { Icon } from './Icon';

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-muted">
      <span className="size-5 animate-spin rounded-full border-2 border-line border-t-forest-2" aria-hidden="true" />
      {label ?? t('common.loading')}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="rounded-2xl border border-[#ecd9d2] bg-[#fdf6f3] px-5 py-6 text-center text-sm text-clay-ink">
      <Icon name="alert" className="mx-auto mb-2 size-6" />
      <p>{errorMessage(t, error)}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 min-h-10 rounded-xl border border-line bg-white px-4 font-bold text-forest hover:bg-sage"
        >
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border-[1.5px] border-dashed border-[#c7d6ca] bg-[#f5f9f3] px-6 py-10 text-center">
      <span className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-[#e1efdf] text-forest-2">
        <Icon name="leaf" className="size-7" />
      </span>
      <h2 className="text-[17px] font-extrabold text-forest">{title}</h2>
      {body && <p className="mx-auto mt-1.5 max-w-xs text-[13px] text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
