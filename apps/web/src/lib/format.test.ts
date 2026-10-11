import { describe, expect, it } from 'vitest';
import { dateInputToTimestamp, formatRelativeDay, parseCalendarDate, toDateInputValue } from './format';

describe('date helpers', () => {
  it('parses calendar dates as local dates', () => {
    const d = parseCalendarDate('2026-03-09');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 9]);
    expect(toDateInputValue(d)).toBe('2026-03-09');
  });

  it('keeps the current time for today and uses local noon for past days', () => {
    const now = new Date(2026, 9, 11, 8, 30);
    expect(dateInputToTimestamp('2026-10-11', now)).toBe(now.toISOString());
    const past = new Date(dateInputToTimestamp('2026-10-05', now));
    expect([past.getDate(), past.getHours()]).toEqual([5, 12]);
  });

  it('describes days relative to today in both languages', () => {
    const now = new Date(2026, 9, 11, 20, 0);
    expect(formatRelativeDay(new Date(2026, 9, 11, 7).toISOString(), 'en', now)).toBe('today');
    expect(formatRelativeDay(new Date(2026, 9, 10, 23).toISOString(), 'en', now)).toBe('yesterday');
    expect(formatRelativeDay(new Date(2026, 9, 8).toISOString(), 'en', now)).toBe('3 days ago');
    expect(formatRelativeDay(new Date(2026, 9, 8).toISOString(), 'he', now)).toBe('לפני 3 ימים');
  });
});
