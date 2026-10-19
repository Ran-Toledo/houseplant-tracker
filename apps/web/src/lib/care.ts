import { useEffect } from 'react';
import type { TFunction } from 'i18next';
import type { DueInfo } from '@houseplant/shared';

/**
 * Watering, snoozing or changing a reminder changes what's due. Parts of the UI
 * that show due items elsewhere on the screen (the tab badge, the "Needs care"
 * strip) listen for this instead of sharing global state.
 */
const CARE_CHANGED = 'houseplant:care-changed';

export function notifyCareChanged(): void {
  window.dispatchEvent(new Event(CARE_CHANGED));
}

export function useCareChanged(callback: () => void): void {
  useEffect(() => {
    window.addEventListener(CARE_CHANGED, callback);
    return () => window.removeEventListener(CARE_CHANGED, callback);
  }, [callback]);
}

/** Due now: overdue or today. These show badges and count towards the tab badge. */
export const isDueNow = (due: DueInfo | null | undefined): due is DueInfo =>
  due != null && (due.status === 'overdue' || due.status === 'today');

/** "Soil check overdue by 2 days" / "Check the soil today" / "Next soil check tomorrow". */
export function dueText(t: TFunction, lang: string, due: DueInfo): string {
  if (due.status === 'overdue') return t('reminders.statusOverdue', { count: -due.daysUntil });
  if (due.status === 'today') return t('reminders.statusToday');
  const when = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(due.daysUntil, 'day');
  return t('reminders.statusNext', { when });
}

/** Why the interval is what it is ("Based on your last 5 waterings"). */
export function basisText(t: TFunction, due: DueInfo): string {
  switch (due.basis) {
    case 'fixed':
      return t('reminders.basis.fixed', { count: due.intervalDays });
    case 'history':
      return t('reminders.basis.history', { count: due.basedOnWaterings });
    case 'species':
      return t('reminders.basis.species', { count: due.intervalDays });
    default:
      return t('reminders.basis.default', { count: due.intervalDays });
  }
}
