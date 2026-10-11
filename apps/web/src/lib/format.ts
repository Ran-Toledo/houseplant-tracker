/** Locale-aware date and number helpers. All user-facing dates go through here. */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parses `YYYY-MM-DD` as a local calendar date (not UTC midnight, which can shift the day). */
export function parseCalendarDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** A date as `YYYY-MM-DD` in local time, for `<input type="date">`. */
export function toDateInputValue(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Converts a date-input value to a timestamp. Today keeps the current time;
 * other days use local noon so the calendar day survives timezone changes.
 */
export function dateInputToTimestamp(value: string, now = new Date()): string {
  if (value === toDateInputValue(now)) return now.toISOString();
  const date = parseCalendarDate(value);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

export function formatDate(value: string | Date, lang: string): string {
  const date =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseCalendarDate(value) : new Date(value);
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(date);
}

/** "today", "yesterday", "3 days ago", "2 months ago" — counted in calendar days. */
export function formatRelativeDay(value: string, lang: string, now = new Date()): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date(value)) - startOfDay(now)) / DAY_MS);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (Math.abs(days) < 30) return rtf.format(days, 'day');
  if (Math.abs(days) < 365) return rtf.format(Math.round(days / 30), 'month');
  return rtf.format(Math.round(days / 365), 'year');
}

export function formatNumber(value: number, lang: string): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(value);
}
