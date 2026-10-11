import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ACTIVITY_TYPES, type Activity, type ActivityType } from '@houseplant/shared';
import { api } from '../api';
import { errorMessage } from '../lib/errors';
import { dateInputToTimestamp, formatDate, formatRelativeDay, toDateInputValue } from '../lib/format';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon, type IconName } from './Icon';
import { useToast } from './Toast';

export const ACTIVITY_ICONS: Record<ActivityType, IconName> = {
  watering: 'droplet',
  fertilizing: 'sparkle',
  repotting: 'pot',
  pruning: 'scissors',
  treatment: 'flower',
};

const inputClass =
  'min-h-11 w-full rounded-xl border border-line bg-white px-3 text-ink outline-none focus:border-[#83b998]';

function LogActivityForm({ plantId, onAdded, onClose }: { plantId: string; onAdded: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [type, setType] = useState<ActivityType>('fertilizing');
  const [date, setDate] = useState(toDateInputValue());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api.addActivity(plantId, { activityType: type, performedAt: dateInputToTimestamp(date), notes });
      toast(t('activity.added'));
      onAdded();
      onClose();
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-5 space-y-3 rounded-2xl border border-line bg-[#fbfcf8] p-4">
      <h3 className="text-sm font-extrabold">{t('activity.logTitle')}</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-bold text-muted">
          {t('activity.type')}
          <select value={type} onChange={(e) => setType(e.target.value as ActivityType)} className={`mt-1 ${inputClass}`}>
            {ACTIVITY_TYPES.map((a) => (
              <option key={a} value={a}>
                {t(`activity.types.${a}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-bold text-muted">
          {t('activity.date')}
          <input
            type="date"
            required
            value={date}
            max={toDateInputValue()}
            onChange={(e) => setDate(e.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>
      </div>
      <label className="block text-xs font-bold text-muted">
        {t('activity.notes')} <span className="font-normal">({t('common.optional')})</span>
        <input
          type="text"
          value={notes}
          maxLength={1000}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('activity.notesPlaceholder')}
          dir="auto"
          className={`mt-1 ${inputClass}`}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-clay-ink">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-line bg-white px-4 font-bold">
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-xl bg-forest-2 px-4 font-extrabold text-white hover:bg-forest disabled:opacity-60"
        >
          {busy ? t('common.saving') : t('activity.add')}
        </button>
      </div>
    </form>
  );
}

/** Chronological care history with a lightweight "log care" form. */
export function ActivityTimeline({
  plantId,
  activities,
  onChanged,
}: {
  plantId: string;
  activities: Activity[];
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteActivity(plantId, pendingDelete.id);
      toast(t('activity.deleted'));
      onChanged();
    } catch (err) {
      toast(errorMessage(t, err));
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <div>
      {!formOpen && (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="mb-4 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-extrabold text-forest hover:bg-sage"
        >
          <Icon name="plus" className="size-4" />
          {t('activity.log')}
        </button>
      )}
      {formOpen && <LogActivityForm plantId={plantId} onAdded={onChanged} onClose={() => setFormOpen(false)} />}

      {activities.length === 0 ? (
        <p className="text-[13px] text-muted">{t('activity.empty')}</p>
      ) : (
        <ol className="relative">
          {activities.map((a, i) => (
            <li key={a.id} className="relative flex items-start gap-[11px] pb-[15px]">
              {i < activities.length - 1 && (
                <span className="absolute start-[15px] top-[32px] bottom-0 w-px bg-line" aria-hidden="true" />
              )}
              <span className="relative grid size-[30px] shrink-0 place-items-center rounded-[11px] bg-[#ebf4eb] text-forest-2">
                <Icon name={ACTIVITY_ICONS[a.activityType]} className="size-[15px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-extrabold">{t(`activity.types.${a.activityType}`)}</div>
                <div className="mt-[3px] text-[10px] text-subtle">
                  <time dateTime={a.performedAt}>{formatDate(a.performedAt, i18n.language)}</time>
                  {' · '}
                  {formatRelativeDay(a.performedAt, i18n.language)}
                </div>
                {a.notes && (
                  <p className="mt-1 text-xs text-[#55695b]" dir="auto">
                    {a.notes}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPendingDelete(a)}
                aria-label={t('activity.delete')}
                className="grid size-9 shrink-0 place-items-center rounded-lg text-subtle hover:bg-sage hover:text-clay-ink"
              >
                <Icon name="close" className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('activity.deleteConfirm')}
        confirmLabel={t('common.delete')}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
