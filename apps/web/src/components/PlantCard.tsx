import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Plant } from '@houseplant/shared';
import { dueText, isDueNow } from '../lib/care';
import { formatRelativeDay } from '../lib/format';
import { ConditionBadge } from './ConditionBadge';
import { Icon } from './Icon';
import { PlantImage } from './PlantImage';

interface PlantCardProps {
  plant: Plant;
  /** Localized common name of the catalog species, if any. */
  speciesName?: string;
  scientificName?: string;
  /** Catalog photo of the species, shown when the plant has no photo of its own. */
  speciesImage?: string | null;
}

/** Gallery card from Screen A of the mockups. */
export function PlantCard({ plant, speciesName, scientificName, speciesImage }: PlantCardProps) {
  const { t, i18n } = useTranslation();
  const subtitle = speciesName ?? plant.customSpeciesName;

  return (
    <Link
      to={`/plants/${plant.id}`}
      aria-label={t('collection.viewDetails', { name: plant.nickname })}
      className="block min-w-0 overflow-hidden rounded-[19px] border border-[#e7eae0] bg-white shadow-card transition duration-150 hover:-translate-y-[3px] hover:shadow-card-hover"
    >
      <div className="relative aspect-[1.06] overflow-hidden bg-sage">
        <PlantImage photo={plant.coverPhoto} name={plant.nickname} speciesImage={speciesImage} speciesName={speciesName} />
        {plant.condition !== 'unknown' && (
          <ConditionBadge condition={plant.condition} className="absolute start-2.5 top-2.5" />
        )}
        {isDueNow(plant.wateringDue) && (
          // "Check soil" status pill from the Screen A mockup.
          <span
            title={dueText(t, i18n.language, plant.wateringDue)}
            className={`absolute end-2.5 top-2.5 flex items-center gap-[5px] rounded-full border border-white/70 bg-[#fffefaed] px-2 py-[5px] text-[9px] font-extrabold backdrop-blur-sm ${
              plant.wateringDue.status === 'overdue' ? 'text-clay-ink' : 'text-ochre-ink'
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${plant.wateringDue.status === 'overdue' ? 'bg-clay' : 'bg-ochre'}`}
              aria-hidden="true"
            />
            {t('reminders.checkSoil')}
          </span>
        )}
      </div>
      <div className="px-3 pt-[13px] pb-3.5 max-[390px]:px-2.5">
        <div className="truncate text-sm font-extrabold tracking-tight">
          <bdi>{plant.nickname}</bdi>
        </div>
        <div className="mb-2.5 truncate text-[10px] text-subtle">
          {subtitle ? (
            <span dir="auto">{subtitle}</span>
          ) : (
            <span>&nbsp;</span>
          )}
          {scientificName && scientificName !== subtitle && (
            <>
              {' · '}
              <i dir="ltr">{scientificName}</i>
            </>
          )}
        </div>
        <div className="mb-2 flex min-h-[15px] items-center gap-1 text-[10px] text-[#718578]">
          {plant.location && (
            <>
              <Icon name="location" className="size-[15px]" />
              <span className="truncate" dir="auto">
                {plant.location}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-[5px] border-t border-line-soft pt-[9px] text-[10px] font-extrabold text-[#4b745b]">
          <Icon name="droplet" className="size-[15px]" />
          <span className="truncate">
            {plant.lastWateredAt
              ? t('watering.wateredWhen', { when: formatRelativeDay(plant.lastWateredAt, i18n.language) })
              : t('watering.never')}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function AddPlantCard() {
  const { t } = useTranslation();
  return (
    <Link
      to="/plants/new"
      className="flex min-h-[253px] flex-col items-center justify-center gap-[11px] rounded-[19px] border-[1.5px] border-dashed border-[#c7d6ca] bg-[#f5f9f3] px-3 text-center text-[#356e4d] hover:bg-[#edf5ea] max-[390px]:min-h-[225px]"
    >
      <span className="grid size-[46px] place-items-center rounded-full bg-[#e1efdf]">
        <Icon name="plus" className="size-[27px]" />
      </span>
      <strong className="text-[13px]">{t('collection.addPlant')}</strong>
      <small className="text-[10px] text-[#88a08d]">{t('collection.addHint')}</small>
    </Link>
  );
}
