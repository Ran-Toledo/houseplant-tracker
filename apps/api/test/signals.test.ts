import type { CareProfile } from '@houseplant/shared';
import { describe, expect, it } from 'vitest';
import { careSignals, type CareSignalKey, type SignalInput } from '../src/care/signals';

const profile: CareProfile = {
  light: { preferred: 'bright-indirect', tolerates: ['medium'] },
  watering: { dryBeforeWatering: 'top-layer', checkEveryDays: { growing: [5, 9], dormant: [10, 18] } },
  growingMonths: [3, 4, 5, 6, 7, 8, 9],
  fertilizeEveryDays: { growing: 30 },
  humidity: 'medium',
};

const plain: SignalInput['plant'] = {
  lightExposure: 'bright-indirect',
  windowOrientation: 'east',
  potMaterial: 'plastic',
  potDiameterCm: 20,
  hasDrainage: true,
  acquiredAt: '2026-01-01',
};

/** 2026-06-15, growing season, fertilized 10 days ago, repotted this year. */
function input(overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    plant: plain,
    profile,
    activities: [
      { activityType: 'fertilizing', performedAt: '2026-06-05T08:00:00Z' },
      { activityType: 'repotting', performedAt: '2026-03-01T08:00:00Z' },
    ],
    latestHealthCheck: null,
    today: '2026-06-15',
    localDate: (t) => t.slice(0, 10),
    month: 6,
    hemisphere: 'north',
    ...overrides,
  };
}

const waterings = (...dates: string[]) => dates.map((d) => ({ activityType: 'watering' as const, performedAt: `${d}T08:00:00Z` }));
const healthCheck = (createdAt: string, keys: string[]) => ({
  createdAt,
  condition: 'needs-attention' as const,
  assessment: {
    condition: 'needs-attention' as const,
    confidence: 'medium' as const,
    summary: { en: '', he: '' },
    findings: keys.map((key) => ({ key: key as never, observation: { en: '', he: '' }, likelihood: 'likely' as const, actions: [] })),
    photoQualityIssue: 'none' as const,
  },
});

const keys = (i: SignalInput) => careSignals(i).map((s) => s.key);

describe('care signals', () => {
  it('reports nothing for a plant in good conditions', () => {
    expect(keys(input())).toEqual([]);
  });

  const cases: [string, Partial<SignalInput>, CareSignalKey[]][] = [
    ['low light for a bright-indirect species', { plant: { ...plain, lightExposure: 'low' } }, ['light-mismatch']],
    ['tolerated light is fine', { plant: { ...plain, lightExposure: 'medium' } }, []],
    [
      'direct sun in a west window',
      { plant: { ...plain, lightExposure: 'direct', windowOrientation: 'west' } },
      ['light-mismatch', 'direct-sun-risk'],
    ],
    [
      'a south window is shady in the southern hemisphere',
      { plant: { ...plain, lightExposure: 'direct', windowOrientation: 'south' }, hemisphere: 'south', month: 12 },
      ['light-mismatch'],
    ],
    ['terracotta', { plant: { ...plain, potMaterial: 'terracotta' } }, ['fast-drying-pot']],
    ['a small pot', { plant: { ...plain, potDiameterCm: 9 } }, ['fast-drying-pot']],
    ['no drainage hole', { plant: { ...plain, hasDrainage: false } }, ['no-drainage']],
    ['unknown drainage is not a signal', { plant: { ...plain, hasDrainage: null } }, []],
    ['winter is dormant, and fertilizing isn’t due then', { month: 12, today: '2026-12-15' }, ['dormant-season']],
    ['fertilizing overdue in the growing season', { today: '2026-07-20', month: 7 }, ['fertilizing-overdue']],
    ['never fertilized', { activities: [{ activityType: 'repotting', performedAt: '2026-03-01T08:00:00Z' }] }, ['fertilizing-overdue']],
    [
      'repotted over two years ago',
      { activities: [{ activityType: 'fertilizing', performedAt: '2026-06-05T08:00:00Z' }, { activityType: 'repotting', performedAt: '2024-03-01T08:00:00Z' }] },
      ['repot-check'],
    ],
    [
      'never repotted, owned for three years',
      { plant: { ...plain, acquiredAt: '2023-05-01' }, activities: [{ activityType: 'fertilizing', performedAt: '2026-06-05T08:00:00Z' }] },
      ['repot-check'],
    ],
    [
      'watered every day, far more often than the species range',
      { activities: [...input().activities, ...waterings('2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13')] },
      ['watering-pattern'],
    ],
    [
      'watering within the range is fine',
      { activities: [...input().activities, ...waterings('2026-05-20', '2026-05-27', '2026-06-03', '2026-06-10')] },
      [],
    ],
    ['a recent health check with findings', { latestHealthCheck: healthCheck('2026-06-10T08:00:00Z', ['overwatering']) }, ['recent-health-findings']],
    ['an old health check', { latestHealthCheck: healthCheck('2026-05-01T08:00:00Z', ['overwatering']) }, []],
    ['only normal ageing', { latestHealthCheck: healthCheck('2026-06-10T08:00:00Z', ['normal-ageing']) }, []],
  ];

  it.each(cases)('%s', (_name, overrides, expected) => {
    expect(keys(input(overrides))).toEqual(expected);
  });

  it('only uses the plant record when the species is unknown', () => {
    const result = careSignals(input({ profile: null, plant: { ...plain, lightExposure: 'low', hasDrainage: false } }));
    expect(result.map((s) => s.key)).toEqual(['no-drainage']);
  });

  it('explains each signal with its facts', () => {
    const [signal] = careSignals(input({ today: '2026-07-20', month: 7 }));
    expect(signal).toEqual({ key: 'fertilizing-overdue', facts: { daysSinceLastFertilizing: 45, fertilizeEveryDays: 30 } });
  });
});
