import type { CareProfile } from '@houseplant/shared';
import { describe, expect, it } from 'vitest';
import { dueInfo, isGrowingSeason, wateringInterval, type IntervalInput } from '../src/care/watering';

const profile: CareProfile = {
  light: { preferred: 'bright-indirect', tolerates: ['medium'] },
  watering: { dryBeforeWatering: 'top-layer', checkEveryDays: { growing: [6, 9], dormant: [10, 16] } },
  growingMonths: [3, 4, 5, 6, 7, 8, 9],
  fertilizeEveryDays: { growing: 30 },
  humidity: 'medium',
};

const base: IntervalInput = { mode: 'adaptive', intervalDays: null, profile, wateringDates: [], month: 6, hemisphere: 'north' };

describe('growing season', () => {
  it('uses the months as given in the north and shifts them by six in the south', () => {
    expect(isGrowingSeason(6, profile.growingMonths, 'north')).toBe(true);
    expect(isGrowingSeason(12, profile.growingMonths, 'north')).toBe(false);
    expect(isGrowingSeason(12, profile.growingMonths, 'south')).toBe(true); // southern December ≈ northern June
    expect(isGrowingSeason(6, profile.growingMonths, 'south')).toBe(false);
  });
});

describe('watering interval', () => {
  it('uses the configured days for a fixed schedule', () => {
    expect(wateringInterval({ ...base, mode: 'fixed', intervalDays: 4 })).toEqual({ intervalDays: 4, basis: 'fixed', basedOnWaterings: 0 });
  });

  it('starts from the short end of the species range for the season', () => {
    expect(wateringInterval(base)).toEqual({ intervalDays: 6, basis: 'species', basedOnWaterings: 0 });
    expect(wateringInterval({ ...base, month: 11 })).toMatchObject({ intervalDays: 10, basis: 'species' });
    expect(wateringInterval({ ...base, profile: null })).toMatchObject({ intervalDays: 7, basis: 'default' });
  });

  it('needs three waterings before following the plant’s own pattern', () => {
    expect(wateringInterval({ ...base, wateringDates: ['2026-06-01', '2026-06-05'] }).basis).toBe('species');
    const result = wateringInterval({ ...base, wateringDates: ['2026-06-09', '2026-06-01', '2026-06-05'] });
    expect(result).toEqual({ intervalDays: 4, basis: 'history', basedOnWaterings: 3 });
  });

  it('takes the median of recent intervals, so one long gap does not stretch reminders', () => {
    // Intervals: 4, 4, 30 (holiday), 5 → median 4.5 → 5 (rounded).
    const dates = ['2026-05-01', '2026-05-05', '2026-05-09', '2026-06-08', '2026-06-13'];
    expect(wateringInterval({ ...base, wateringDates: dates })).toMatchObject({ intervalDays: 5, basis: 'history' });
  });

  it('keeps the plant’s pattern within half the species minimum and twice its maximum', () => {
    const daily = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04'];
    expect(wateringInterval({ ...base, wateringDates: daily }).intervalDays).toBe(3); // ceil(6 / 2)
    const monthly = ['2026-01-01', '2026-02-10', '2026-03-22', '2026-05-01'];
    expect(wateringInterval({ ...base, wateringDates: monthly }).intervalDays).toBe(18); // 9 × 2
  });

  it('counts several logs on the same day as one watering', () => {
    const dates = ['2026-06-01', '2026-06-01', '2026-06-05', '2026-06-05'];
    expect(wateringInterval({ ...base, wateringDates: dates }).basis).toBe('species');
  });
});

describe('due info', () => {
  const interval = { intervalDays: 7, basis: 'species' as const, basedOnWaterings: 0 };

  it('derives the due date and status from the anchor date', () => {
    const at = (today: string) => dueInfo({ anchorDate: '2026-10-10', interval, snoozedUntil: null, today });
    expect(at('2026-10-12')).toMatchObject({ dueOn: '2026-10-17', daysUntil: 5, status: 'later' });
    expect(at('2026-10-15')).toMatchObject({ daysUntil: 2, status: 'soon' });
    expect(at('2026-10-17')).toMatchObject({ daysUntil: 0, status: 'today' });
    expect(at('2026-10-19')).toMatchObject({ daysUntil: -2, status: 'overdue' });
  });

  it('lets a snooze postpone the reminder but never bring it forward', () => {
    const later = dueInfo({ anchorDate: '2026-10-10', interval, snoozedUntil: '2026-10-21', today: '2026-10-19' });
    expect(later).toMatchObject({ dueOn: '2026-10-21', daysUntil: 2, status: 'soon', snoozedUntil: '2026-10-21' });
    const earlier = dueInfo({ anchorDate: '2026-10-10', interval, snoozedUntil: '2026-10-12', today: '2026-10-11' });
    expect(earlier.dueOn).toBe('2026-10-17');
  });

  it('crosses month and year boundaries', () => {
    const result = dueInfo({ anchorDate: '2026-12-28', interval, snoozedUntil: null, today: '2026-12-30' });
    expect(result).toMatchObject({ dueOn: '2027-01-04', daysUntil: 5 });
  });
});
