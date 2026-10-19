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
