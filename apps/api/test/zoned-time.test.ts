import { describe, expect, it } from 'vitest';
import { localParts, startOfLocalMonth, zonedToUtc } from '../src/lib/zoned-time';

const TZ = 'Asia/Jerusalem';

describe('zoned time', () => {
  it('reads the local wall-clock time', () => {
    // Israel is on summer time (UTC+3) until 25 October 2026.
    expect(localParts(new Date('2026-10-19T21:30:00Z'), TZ)).toEqual({ year: 2026, month: 10, day: 20, hour: 0, minute: 30 });
    expect(localParts(new Date('2026-12-01T10:00:00Z'), TZ)).toMatchObject({ hour: 12 });
  });

  it('converts local times to UTC on both sides of the DST change', () => {
    expect(zonedToUtc({ year: 2026, month: 10, day: 20, hour: 8, minute: 30 }, TZ).toISOString()).toBe('2026-10-20T05:30:00.000Z');
    expect(zonedToUtc({ year: 2026, month: 10, day: 26, hour: 8, minute: 30 }, TZ).toISOString()).toBe('2026-10-26T06:30:00.000Z');
    expect(zonedToUtc({ year: 2026, month: 1, day: 1 }, 'UTC').toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('finds local midnight at the start of the month', () => {
    expect(startOfLocalMonth(new Date('2026-10-19T12:00:00Z'), TZ).toISOString()).toBe('2026-09-30T21:00:00.000Z');
    // 31 October 23:30 UTC is already 1 November locally (UTC+2 after the change).
    expect(startOfLocalMonth(new Date('2026-10-31T23:30:00Z'), TZ).toISOString()).toBe('2026-10-31T22:00:00.000Z');
  });
});
