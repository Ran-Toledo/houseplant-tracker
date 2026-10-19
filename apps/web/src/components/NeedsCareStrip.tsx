import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { DueItem } from '@houseplant/shared';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';
import { useSpeciesCatalog } from '../hooks/useSpecies';
import { notifyCareChanged, useCareChanged, dueText } from '../lib/care';
import { errorMessage } from '../lib/errors';
import { Icon } from './Icon';
import { PlantImage } from './PlantImage';
import { useToast } from './Toast';

/** Top of My plants: plants whose soil check is overdue, today or tomorrow, with a one-tap "Watered". */
export function NeedsCareStrip({ onWatered }: { onWatered: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const catalog = useSpeciesCatalog();
  const due = useAsync(() => api.listDue(1), []);
  const reload = useCallback(() => due.reload(), [due.reload]);
  useCareChanged(reload);
  const [busy, setBusy] = useState<string | null>(null);

  async function water(item: DueItem) {
    setBusy(item.plantId);
    try {
      await api.addActivity(item.plantId, { activityType: 'watering', performedAt: new Date().toISOString() });
      toast(t('watering.recorded'));
      notifyCareChanged();
      onWatered();
    } catch (err) {
      toast(errorMessage(t, err));
    } finally {
      setBusy(null);
    }
  }

  const items = due.data ?? [];
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="needs-care" className="mb-6 rounded-[19px] border border-[#ecdcbf] bg-[#fdf8ee] p-3.5">
      <h2 id="needs-care" className="mb-2.5 flex items-center gap-2 text-sm font-extrabold text-[#6d4f17]">
        <Icon name="droplet" className="size-[18px]" />
        {t('reminders.needsCare')}
        <span className="rounded-full bg-[#f6e7c8] px-2 py-0.5 text-[11px]">{items.length}</span>
      </h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.plantId} className="flex items-center gap-3 rounded-[14px] bg-white p-2 shadow-[0_2px_10px_#5c46160d]">
            <Link to={`/plants/${item.plantId}`} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="size-11 shrink-0 overflow-hidden rounded-[11px] bg-sage">
                <PlantImage
                  photo={item.coverPhoto}
                  name={item.nickname}
                  speciesImage={catalog.get(item.speciesId)?.imageUrl}
                  speciesName={catalog.commonName(item.speciesId)}
                />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-extrabold">
                  <bdi>{item.nickname}</bdi>
                </span>
                <span
                  className={`block truncate text-[11px] font-bold ${item.due.status === 'overdue' ? 'text-clay-ink' : 'text-[#8a6a2a]'}`}
                >
                  {dueText(t, i18n.language, item.due)}
                </span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => void water(item)}
              disabled={busy === item.plantId}
              aria-label={t('reminders.wateredNamed', { name: item.nickname })}
              className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-forest-2 px-3 text-xs font-extrabold text-white hover:bg-forest disabled:opacity-70"
            >
              <Icon name="check" className="size-[14px]" />
              {busy === item.plantId ? t('common.saving') : t('reminders.watered')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
