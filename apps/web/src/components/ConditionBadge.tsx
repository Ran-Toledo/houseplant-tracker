import { useTranslation } from 'react-i18next';
import type { Condition } from '@houseplant/shared';

const STYLES: Record<Condition, { text: string; dot: string }> = {
  healthy: { text: 'text-[#326449]', dot: 'bg-leaf' },
  'needs-attention': { text: 'text-ochre-ink', dot: 'bg-ochre' },
  unhealthy: { text: 'text-clay-ink', dot: 'bg-clay' },
  unknown: { text: 'text-muted', dot: 'bg-[#b6c0b8]' },
};

/** Frosted status pill shown over plant photos. */
export function ConditionBadge({ condition, className = '' }: { condition: Condition; className?: string }) {
  const { t } = useTranslation();
  const style = STYLES[condition];
  return (
    <span
      className={`flex items-center gap-[5px] rounded-full border border-white/70 bg-[#fffefaed] px-2 py-[5px] text-[9px] font-extrabold backdrop-blur-sm ${style.text} ${className}`}
    >
      <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {t(`condition.${condition}`)}
    </span>
  );
}
