import { randomUUID } from 'node:crypto';
import type { CareSchedule, careScheduleInputSchema, DueInfo, DueItem, Plant, ScheduledActivityType } from '@houseplant/shared';
import type { z } from 'zod';
import type { SpeciesCatalog } from '../catalog/loader';
import { dueInfo, wateringInterval } from '../care/watering';
import type { CareScheduleRow } from '../db/schema';
import { localDate, localParts } from '../lib/zoned-time';
import { notFound } from '../middleware/errors';
import type { CareScheduleRepository } from '../repositories/care-schedules';
import type { SettingsService } from './settings';

type ScheduleInput = z.output<typeof careScheduleInputSchema>;

/** Enough recent waterings for the adaptive interval, with room for same-day duplicates. */
const RECENT_WATERINGS = 12;

interface Deps {
  schedules: CareScheduleRepository;
  catalog: SpeciesCatalog;
  settings: SettingsService;
  now?: () => Date;
}

type PlantRef = Pick<Plant, 'id' | 'speciesId'>;

export function createCareService({ schedules, catalog, settings, now = () => new Date() }: Deps) {
  /** Due info for each plant with an enabled schedule of `activityType`, keyed by plant id. */
  function dueFor(plants: PlantRef[], activityType: ScheduledActivityType = 'watering'): Map<string, { schedule: CareScheduleRow; due: DueInfo }> {
    const result = new Map<string, { schedule: CareScheduleRow; due: DueInfo }>();
    const rows = schedules.listEnabled(activityType, plants.map((p) => p.id));
    if (rows.length === 0) return result;

    const { timezone, hemisphere } = settings.get();
    const instant = now();
    const today = localDate(instant, timezone);
    const { month } = localParts(instant, timezone);
    const speciesOf = new Map(plants.map((p) => [p.id, p.speciesId]));
    const recent = schedules.recentActivityTimes(activityType, rows.map((r) => r.plantId), RECENT_WATERINGS);

    for (const schedule of rows) {
      const speciesId = speciesOf.get(schedule.plantId);
      const wateringDates = (recent.get(schedule.plantId) ?? []).map((t) => localDate(new Date(t), timezone));
      const interval = wateringInterval({
        mode: schedule.mode,
        intervalDays: schedule.intervalDays,
        profile: speciesId ? catalog.get(speciesId)?.careProfile : null,
        wateringDates,
        month,
        hemisphere,
      });
      // Newest first, so the first entry is the last watering.
      const anchorDate = wateringDates[0] ?? localDate(new Date(schedule.createdAt), timezone);
      result.set(schedule.plantId, { schedule, due: dueInfo({ anchorDate, interval, snoozedUntil: schedule.snoozedUntil, today }) });
    }
    return result;
  }

  function toDto(row: CareScheduleRow, plant: PlantRef): CareSchedule {
    return {
      id: row.id,
      plantId: row.plantId,
      activityType: row.activityType,
      mode: row.mode,
      intervalDays: row.mode === 'fixed' ? row.intervalDays : null,
      enabled: row.enabled,
      snoozedUntil: row.snoozedUntil,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      due: row.enabled ? (dueFor([plant], row.activityType).get(plant.id)?.due ?? null) : null,
    };
  }

  return {
    /** Adds `wateringDue` to plants (null when they have no enabled watering reminder). */
    withWateringDue<P extends Omit<Plant, 'wateringDue'>>(plants: P[]): (P & { wateringDue: DueInfo | null })[] {
      const due = dueFor(plants, 'watering');
      return plants.map((p) => ({ ...p, wateringDue: due.get(p.id)?.due ?? null }));
    },

    listForPlant(plant: PlantRef): CareSchedule[] {
      return schedules.listForPlant(plant.id).map((row) => toDto(row, plant));
    },

    setSchedule(plant: PlantRef, activityType: ScheduledActivityType, input: ScheduleInput): CareSchedule {
      const timestamp = now().toISOString();
      const existing = schedules.listForPlant(plant.id).find((s) => s.activityType === activityType);
      const row = schedules.upsert({
        id: existing?.id ?? randomUUID(),
        plantId: plant.id,
        activityType,
        mode: input.mode,
        intervalDays: input.mode === 'fixed' ? (input.intervalDays ?? null) : null,
        enabled: input.enabled,
        // Changing the schedule starts afresh.
        snoozedUntil: null,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
      return toDto(row, plant);
    },

    /** Postpones the current reminder by `days` from today. */
    snooze(scheduleId: string, days: number, plantOf: (plantId: string) => PlantRef): CareSchedule {
      const row = schedules.get(scheduleId);
      if (!row) throw notFound('Schedule');
      const { timezone } = settings.get();
      const today = localDate(now(), timezone);
      const until = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
      schedules.setSnooze(row.id, until, now().toISOString());
      return toDto({ ...row, snoozedUntil: until }, plantOf(row.plantId));
    },

    /** Logging the activity answers the reminder, so any snooze is dropped. */
    activityLogged(plantId: string, activityType: string): void {
      if (activityType === 'watering') schedules.clearSnooze(plantId, 'watering', now().toISOString());
    },

    /** Plants whose next check is overdue or due within `days` days, most urgent first. */
    dueItems(plants: Omit<Plant, 'wateringDue'>[], days: number): DueItem[] {
      const due = dueFor(plants, 'watering');
      return plants
        .flatMap((p): DueItem[] => {
          const entry = due.get(p.id);
          if (!entry || entry.due.daysUntil > days) return [];
          return [
            {
              plantId: p.id,
              nickname: p.nickname,
              speciesId: p.speciesId,
              customSpeciesName: p.customSpeciesName,
              location: p.location,
              coverPhoto: p.coverPhoto,
              scheduleId: entry.schedule.id,
              activityType: 'watering',
              due: entry.due,
            },
          ];
        })
        .sort((a, b) => a.due.daysUntil - b.due.daysUntil || a.nickname.localeCompare(b.nickname));
    },
  };
}

export type CareService = ReturnType<typeof createCareService>;
