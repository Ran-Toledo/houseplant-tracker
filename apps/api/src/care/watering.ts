import type { CareProfile, DueInfo, DueStatus, Hemisphere, IntervalBasis, ScheduleMode } from '@houseplant/shared';
import { addDays, daysBetween } from '../lib/zoned-time';

/**
 * Pure watering-reminder maths: which season it is, how many days to wait
 * before the next soil check, and when that check is due. No I/O, so it is
 * easy to test; the care service feeds it data.
 */

/** Used when a plant has no catalog species (or its species has no careProfile). */
const FALLBACK = {
  checkEveryDays: { growing: [7, 10] as [number, number], dormant: [10, 14] as [number, number] },
  growingMonths: [3, 4, 5, 6, 7, 8, 9],
};

/** Items due within this many days count as "soon". */
export const SOON_DAYS = 2;
/** Recent intervals considered for the adaptive interval. */
const HISTORY_INTERVALS = 5;
/** At least this many logged waterings before the plant's own pattern is trusted. */
export const MIN_WATERINGS_FOR_HISTORY = 3;

/** Whether `month` (1–12) is in the growing season. `growingMonths` are for the northern hemisphere. */
export function isGrowingSeason(month: number, growingMonths: number[], hemisphere: Hemisphere): boolean {
  // Southern July corresponds to northern January, and so on.
  const northernMonth = hemisphere === 'south' ? ((month + 5) % 12) + 1 : month;
  return growingMonths.includes(northernMonth);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export interface IntervalInput {
  mode: ScheduleMode;
  /** The configured interval for `fixed`. */
  intervalDays: number | null;
  /** The species' care profile, if known. */
  profile: CareProfile | null | undefined;
  /** Local dates (`YYYY-MM-DD`) of logged waterings, in any order. */
  wateringDates: string[];
  /** Current local month, 1–12. */
  month: number;
  hemisphere: Hemisphere;
}

export interface IntervalResult {
  intervalDays: number;
  basis: IntervalBasis;
  basedOnWaterings: number;
}

/**
 * Days until the next soil check.
 * - fixed: the configured interval.
 * - adaptive with ≥ 3 waterings: the median of the recent intervals between
 *   them, kept within half the species' minimum and twice its maximum for the
 *   season. That bound is wide on purpose: a sunny balcony really can need
 *   checks twice as often, but a one-off long gap shouldn't stretch reminders.
 * - adaptive otherwise: the short end of the species' range for the season,
 *   because an early soil check costs less than a late one.
 */
export function wateringInterval(input: IntervalInput): IntervalResult {
  if (input.mode === 'fixed' && input.intervalDays) {
    return { intervalDays: input.intervalDays, basis: 'fixed', basedOnWaterings: 0 };
  }
  const source = input.profile
    ? { checkEveryDays: input.profile.watering.checkEveryDays, growingMonths: input.profile.growingMonths }
    : FALLBACK;
  const season = isGrowingSeason(input.month, source.growingMonths, input.hemisphere) ? 'growing' : 'dormant';
  const [min, max] = source.checkEveryDays[season];

  // One watering per day at most; several logs on the same day are one watering.
  const dates = [...new Set(input.wateringDates)].sort();
  if (dates.length >= MIN_WATERINGS_FOR_HISTORY) {
    const intervals = dates
      .slice(1)
      .map((date, i) => daysBetween(dates[i]!, date))
      .slice(-HISTORY_INTERVALS);
    const bounded = Math.min(Math.max(Math.round(median(intervals)), Math.ceil(min / 2)), max * 2);
    return { intervalDays: bounded, basis: 'history', basedOnWaterings: Math.min(dates.length, HISTORY_INTERVALS + 1) };
  }
  return { intervalDays: min, basis: input.profile ? 'species' : 'default', basedOnWaterings: 0 };
}

export interface DueInput {
  /** Local date of the last watering, or of the schedule's creation if there's none yet. */
  anchorDate: string;
  interval: IntervalResult;
  snoozedUntil: string | null;
  today: string;
}

export function dueInfo({ anchorDate, interval, snoozedUntil, today }: DueInput): DueInfo {
  const computed = addDays(anchorDate, interval.intervalDays);
  // A snooze can only postpone a reminder, never bring it forward.
  const dueOn = snoozedUntil && snoozedUntil > computed ? snoozedUntil : computed;
  const daysUntil = daysBetween(today, dueOn);
  const status: DueStatus = daysUntil < 0 ? 'overdue' : daysUntil === 0 ? 'today' : daysUntil <= SOON_DAYS ? 'soon' : 'later';
  return {
    dueOn,
    daysUntil,
    status,
    intervalDays: interval.intervalDays,
    basis: interval.basis,
    basedOnWaterings: interval.basedOnWaterings,
    snoozedUntil,
  };
}
