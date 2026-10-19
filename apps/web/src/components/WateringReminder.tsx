import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CareScheduleInput, DueInfo } from '@houseplant/shared';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';
import { basisText, dueText, isDueNow, notifyCareChanged } from '../lib/care';
import { errorMessage } from '../lib/errors';
import { useToast } from './Toast';

type Choice = 'off' | 'adaptive' | 'fixed';
const DEFAULT_FIXED_DAYS = 7;

/** Reminder part of the plant page's watering card: next check, why, the schedule choice and snooze. */
export function WateringReminder({ plantId, due, onChanged }: { plantId: string; due: DueInfo | null; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const selectId = useId();
  const daysId = useId();
  const schedules = useAsync(() => api.getSchedules(plantId), [plantId]);
  const schedule = schedules.data?.find((s) => s.activityType === 'watering');
  const choice: Choice = !schedule?.enabled ? 'off' : schedule.mode;
  const [days, setDays] = useState(String(DEFAULT_FIXED_DAYS));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (schedule?.intervalDays) setDays(String(schedule.intervalDays));
  }, [schedule?.intervalDays]);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      toast(message);
      schedules.reload();
      notifyCareChanged();
      onChanged();
    } catch (err) {
      toast(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  function save(next: Choice, fixedDays = Number(days)) {
    const input: CareScheduleInput =
      next === 'off'
        ? { enabled: false, mode: schedule?.mode ?? 'adaptive' }
        : next === 'fixed'
          ? { enabled: true, mode: 'fixed', intervalDays: fixedDays }
          : { enabled: true, mode: 'adaptive' };
    void run(() => api.setWateringSchedule(plantId, input), t('reminders.saved'));
  }

  function saveDays() {
    const value = Number(days);
    if (!Number.isInteger(value) || value < 1 || value > 90) {
      toast(t('reminders.daysInvalid'));
      return;
    }
    if (value !== schedule?.intervalDays) save('fixed', value);
  }

  return (
    <div className="mt-3.5 border-t border-[#d3e6d6] pt-3">
      {due && (
        <p className={`text-[12px] font-extrabold ${due.status === 'overdue' ? 'text-clay-ink' : 'text-forest-2'}`}>
          {dueText(t, i18n.language, due)}
          <span className="block text-[11px] font-normal text-[#68836f]">{basisText(t, due)}</span>
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={selectId} className="text-[11px] font-extrabold text-[#52775b]">
          {t('reminders.title')}
        </label>
        <select
          id={selectId}
          value={choice}
          disabled={busy || schedules.loading}
          onChange={(e) => save(e.target.value as Choice)}
          className="min-h-9 rounded-lg border border-[#cfe1d2] bg-white px-2 text-xs font-bold"
        >
          <option value="off">{t('reminders.off')}</option>
          <option value="adaptive">{t('reminders.adaptive')}</option>
          <option value="fixed">{t('reminders.fixed')}</option>
        </select>
        {choice === 'fixed' && (
          <span className="flex items-center gap-1.5">
            <input
              id={daysId}
              type="number"
              inputMode="numeric"
              min={1}
              max={90}
              value={days}
              disabled={busy}
              onChange={(e) => setDays(e.target.value)}
              onBlur={saveDays}
              onKeyDown={(e) => e.key === 'Enter' && saveDays()}
              className="min-h-9 w-16 rounded-lg border border-[#cfe1d2] bg-white px-2 text-xs font-bold"
            />
            <label htmlFor={daysId} className="text-[11px] text-[#52775b]">
              {t('reminders.days')}
            </label>
          </span>
        )}
      </div>
      {choice === 'adaptive' && <p className="mt-1.5 text-[11px] text-[#68836f]">{t('reminders.adaptiveHint')}</p>}

      {schedule && isDueNow(due) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-[#68836f]">{t('reminders.snooze')}</span>
          {[1, 3].map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => void run(() => api.snoozeSchedule(schedule.id, n), t('reminders.snoozed'))}
              className="min-h-9 rounded-full border border-[#cfe1d2] bg-white px-3 text-[11px] font-extrabold text-forest-2 disabled:opacity-60"
            >
              {new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' }).format(n, 'day')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
