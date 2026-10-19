/**
 * Calendar maths in a named time zone. The container clock is UTC, so anything
 * that depends on the owner's local date (monthly AI usage, due dates, the daily
 * notification time) goes through these helpers with the `timezone` setting.
 */

export interface LocalParts {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** The wall-clock date and time of `instant` in `timeZone`. */
export function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds (positive east of UTC). */
function offsetMs(instant: Date, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(instant.getTime() / 60_000) * 60_000;
}

/** The UTC instant at which the given local wall-clock time occurs in `timeZone`. */
export function zonedToUtc(local: Omit<LocalParts, 'hour' | 'minute'> & { hour?: number; minute?: number }, timeZone: string): Date {
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour ?? 0, local.minute ?? 0);
  // Two passes settle the offset across a DST change between the guess and the result.
  let result = guess - offsetMs(new Date(guess), timeZone);
  result = guess - offsetMs(new Date(result), timeZone);
  return new Date(result);
}

/** UTC instant of local midnight on the first day of the month containing `instant`. */
export function startOfLocalMonth(instant: Date, timeZone: string): Date {
  const { year, month } = localParts(instant, timeZone);
  return zonedToUtc({ year, month, day: 1 }, timeZone);
}

/** The local calendar date (`YYYY-MM-DD`) of `instant` in `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  const { year, month, day } = localParts(instant, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const DAY_MS = 86_400_000;
const dateToUtcMs = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** Calendar arithmetic on `YYYY-MM-DD` dates (no time zone involved). */
export function addDays(date: string, days: number): string {
  return new Date(dateToUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateToUtcMs(to) - dateToUtcMs(from)) / DAY_MS);
}
