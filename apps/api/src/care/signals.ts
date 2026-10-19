import type { Activity, CareProfile, HealthCheck, Hemisphere, Plant, WindowOrientation } from '@houseplant/shared';
import { daysBetween } from '../lib/zoned-time';
import { isGrowingSeason, median, MIN_WATERINGS_FOR_HISTORY } from './watering';

/**
 * Care signals: plain facts about a plant's situation that the assistant
 * reads (through its `get_care_signals` tool) so its advice rests on the same
 * rules every time, rather than on whatever the model notices. Pure: no I/O,
 * nothing stored.
 */

export const CARE_SIGNAL_KEYS = [
  'light-mismatch',
  'direct-sun-risk',
  'fast-drying-pot',
  'no-drainage',
  'dormant-season',
  'fertilizing-overdue',
  'repot-check',
  'watering-pattern',
  'recent-health-findings',
] as const;
export type CareSignalKey = (typeof CARE_SIGNAL_KEYS)[number];

export interface CareSignal {
  key: CareSignalKey;
  /** The facts behind the signal, for the assistant to explain. */
  facts: Record<string, unknown>;
}

export interface SignalInput {
  plant: Pick<Plant, 'lightExposure' | 'windowOrientation' | 'potMaterial' | 'potDiameterCm' | 'hasDrainage' | 'acquiredAt'>;
  /** The species' care profile, when the plant has a catalog species. */
  profile: CareProfile | null | undefined;
  /** The plant's activities, in any order. */
  activities: Pick<Activity, 'activityType' | 'performedAt'>[];
  latestHealthCheck: Pick<HealthCheck, 'createdAt' | 'condition' | 'assessment'> | null;
  /** Today's local date, `YYYY-MM-DD`. */
  today: string;
  /** Converts a timestamp to a local date, `YYYY-MM-DD`. */
  localDate: (timestamp: string) => string;
  /** Current local month, 1–12. */
  month: number;
  hemisphere: Hemisphere;
}

/** Pots this small (cm) dry out quickly. */
const SMALL_POT_CM = 12;
const REPOT_AFTER_DAYS = 730;
const RECENT_HEALTH_DAYS = 14;

/** Windows that get strong afternoon or midday sun, by hemisphere. */
const SUNNY_WINDOWS: Record<Hemisphere, WindowOrientation[]> = {
  north: ['south', 'south-west', 'west'],
  south: ['north', 'north-west', 'west'],
};

export function careSignals(input: SignalInput): CareSignal[] {
  const { plant, profile, today } = input;
  const signals: CareSignal[] = [];
  const add = (key: CareSignalKey, facts: Record<string, unknown> = {}) => signals.push({ key, facts });

  const datesOf = (type: Activity['activityType']) =>
    [...new Set(input.activities.filter((a) => a.activityType === type).map((a) => input.localDate(a.performedAt)))].sort();
  const daysSince = (date: string | undefined) => (date ? daysBetween(date, today) : null);

  if (profile && plant.lightExposure) {
    const fits = plant.lightExposure === profile.light.preferred || profile.light.tolerates.includes(plant.lightExposure);
    if (!fits) add('light-mismatch', { plantLight: plant.lightExposure, preferred: profile.light.preferred, tolerates: profile.light.tolerates });
  }

  const toleratesDirect = profile ? profile.light.preferred === 'direct' || profile.light.tolerates.includes('direct') : true;
  if (
    plant.lightExposure === 'direct' &&
    plant.windowOrientation &&
    SUNNY_WINDOWS[input.hemisphere].includes(plant.windowOrientation) &&
    !toleratesDirect
  ) {
    add('direct-sun-risk', { window: plant.windowOrientation });
  }

  const fastDrying = [
    plant.potMaterial === 'terracotta' && 'terracotta pot',
    plant.potDiameterCm !== null && plant.potDiameterCm < SMALL_POT_CM && `small pot (${plant.potDiameterCm} cm)`,
  ].filter((r): r is string => Boolean(r));
  if (fastDrying.length) add('fast-drying-pot', { reasons: fastDrying });

  if (plant.hasDrainage === false) add('no-drainage');

  const growing = profile ? isGrowingSeason(input.month, profile.growingMonths, input.hemisphere) : null;
  if (growing === false) add('dormant-season', { month: input.month });

  if (profile && growing) {
    const last = datesOf('fertilizing').at(-1);
    const since = daysSince(last);
    if (since === null || since > profile.fertilizeEveryDays.growing) {
      add('fertilizing-overdue', { daysSinceLastFertilizing: since, fertilizeEveryDays: profile.fertilizeEveryDays.growing });
    }
  }

  const lastRepot = datesOf('repotting').at(-1);
  const sinceRepot = daysSince(lastRepot);
  const sinceAcquired = daysSince(plant.acquiredAt ?? undefined);
  if ((sinceRepot ?? sinceAcquired ?? 0) > REPOT_AFTER_DAYS) {
    add('repot-check', lastRepot ? { daysSinceLastRepotting: sinceRepot } : { neverRepottedSinceAcquiredDaysAgo: sinceAcquired });
  }

  const waterings = datesOf('watering');
  if (profile && growing !== null && waterings.length >= MIN_WATERINGS_FOR_HISTORY) {
    const intervals = waterings.slice(1).map((d, i) => daysBetween(waterings[i]!, d)).slice(-5);
    const typical = Math.round(median(intervals));
    const [min, max] = profile.watering.checkEveryDays[growing ? 'growing' : 'dormant'];
    if (typical < Math.ceil(min / 2) || typical > max * 2) {
      add('watering-pattern', { typicalDaysBetweenWaterings: typical, speciesCheckEveryDays: [min, max], season: growing ? 'growing' : 'dormant' });
    }
  }

  const check = input.latestHealthCheck;
  if (check) {
    const age = daysBetween(input.localDate(check.createdAt), today);
    const findings = check.assessment.findings.filter((f) => f.key !== 'normal-ageing').map((f) => f.key);
    if (age <= RECENT_HEALTH_DAYS && findings.length) {
      add('recent-health-findings', { daysAgo: age, condition: check.condition, findings });
    }
  }

  return signals;
}
