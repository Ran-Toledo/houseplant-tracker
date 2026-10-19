import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiConfidence } from '@houseplant/shared';
import { Icon } from './Icon';

export const CONFIDENCE_STYLE: Record<AiConfidence, string> = {
  high: 'border-[#cfe6d4] bg-mint text-[#2f6a45]',
  medium: 'border-[#f0dcc0] bg-[#fdf3e3] text-[#8a5a14]',
  low: 'border-line bg-[#f4f3ee] text-[#6d756c]',
};

/** Small label marking AI-generated content. */
export function AiTag() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#dbe4f3] bg-[#eef3fb] px-[7px] py-[3px] text-[9px] font-extrabold tracking-[.06em] text-[#3d5a87] uppercase rtl:tracking-normal">
      <Icon name="sparkle" className="size-3" />
      {t('ai.tag')}
    </span>
  );
}

/** Spinner with a line saying what's happening during a slow model call. */
export function AiProgress({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex items-center gap-2.5 rounded-xl bg-[#f5f9f3] p-2.5 text-xs text-[#43584a]">
      <span
        aria-hidden="true"
        className="size-5 shrink-0 animate-spin rounded-full border-[2.5px] border-[#cfe2d2] border-t-forest-2"
      />
      <span>{children}</span>
    </div>
  );
}
