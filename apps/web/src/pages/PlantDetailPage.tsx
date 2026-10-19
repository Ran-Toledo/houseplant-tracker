import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { speciesImageUrl, type Plant } from '@houseplant/shared';
import { api } from '../api';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { CareGuide, SectionHeading } from '../components/CareGuide';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { HealthChecks } from '../components/HealthChecks';
import { Icon } from '../components/Icon';
import { PhotoGallery } from '../components/PhotoGallery';
import { PlantImage } from '../components/PlantImage';
import { ErrorState, LoadingState } from '../components/StatusViews';
import { useToast } from '../components/Toast';
import { WateringReminder } from '../components/WateringReminder';
import { useAiAvailable } from '../hooks/useAiAvailable';
import { useAsync } from '../hooks/useAsync';
import { openPlantConversation } from '../lib/assistant';
import { notifyCareChanged } from '../lib/care';
import { errorMessage, isNotFound } from '../lib/errors';
import { formatDate, formatNumber, formatRelativeDay } from '../lib/format';
import { NotFoundPage } from './NotFoundPage';

function Separator() {
  return <hr className="mt-[26px] mb-[22px] border-0 border-t border-line" />;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 text-xs [&+&]:border-t [&+&]:border-[#eff1e9]">
      <dt className="text-[#899588]">{label}</dt>
      <dd className="max-w-[65%] text-end font-extrabold text-[#385340]">{children}</dd>
    </div>
  );
}

function WateringCard({ plant, onWatered }: { plant: Plant; onWatered: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function waterNow() {
    setBusy(true);
    try {
      await api.addActivity(plant.id, { activityType: 'watering', performedAt: new Date().toISOString() });
      toast(t('watering.recorded'));
      notifyCareChanged();
      onWatered();
    } catch (err) {
      toast(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label={t('watering.title')}
      className="mb-7 rounded-[19px] border border-[#daeadb] bg-linear-135 from-[#f2f9f0] to-[#e7f4ec] p-[17px]"
    >
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-[14px] bg-[#d4e9dd] text-[#3c8066]">
          <Icon name="droplet" className="size-6" />
        </div>
        <div>
          <div className="text-sm font-extrabold">{t('watering.title')}</div>
          <p className="mt-[3px] text-[11px] text-[#68836f]">
            {plant.lastWateredAt
              ? t('watering.lastWatered', { when: formatRelativeDay(plant.lastWateredAt, i18n.language) })
              : t('watering.never')}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void waterNow()}
        disabled={busy}
        className="mt-[15px] flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-forest-2 p-3 text-[13px] font-extrabold text-white hover:bg-forest active:scale-[.99] disabled:opacity-70"
      >
        <Icon name="check" className="size-[15px]" />
        {busy ? t('common.saving') : t('watering.wateredToday')}
      </button>
      <WateringReminder plantId={plant.id} due={plant.wateringDue} onChanged={onWatered} />
    </section>
  );
}

/** Screen B — one plant: identity, watering, species guide, personal info, history and photos. */
export function PlantDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [healthPhotoId, setHealthPhotoId] = useState<string | null>(null);
  const aiAvailable = useAiAvailable();

  const plant = useAsync(() => api.getPlant(id), [id]);
  const speciesId = plant.data?.speciesId;
  const species = useAsync(() => (speciesId ? api.getSpecies(speciesId) : Promise.resolve(null)), [speciesId]);
  const activities = useAsync(() => api.listActivities(id), [id]);
  const photos = useAsync(() => api.listPhotos(id), [id]);

  if (plant.error) {
    if (isNotFound(plant.error)) return <NotFoundPage />;
    return <ErrorState error={plant.error} onRetry={plant.reload} />;
  }
  if (!plant.data) return <LoadingState />;
  const p = plant.data;
  const lang = i18n.resolvedLanguage === 'he' ? 'he' : 'en';
  const speciesData = species.data ?? null;
  const commonName = speciesData?.localizations[lang].commonName ?? p.customSpeciesName;

  const refreshAfterActivity = () => {
    plant.reload();
    activities.reload();
  };
  const refreshAfterPhoto = () => {
    plant.reload();
    photos.reload();
  };

  async function deletePlant() {
    setDeleting(true);
    try {
      await api.deletePlant(p.id);
      toast(t('details.deleted'));
      navigate('/', { replace: true });
    } catch (err) {
      toast(errorMessage(t, err));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const notSet = <span className="font-normal text-subtle">{t('common.notSet')}</span>;
  const exposure = [
    p.lightExposure && t(`light.${p.lightExposure}`),
    p.windowOrientation && t(`orientation.${p.windowOrientation}`),
  ].filter(Boolean);

  return (
    <>
      <div className="-mt-1.5 mb-[15px] flex items-center justify-between gap-4">
        <Link to="/" className="flex min-h-10 items-center gap-1.5 text-xs font-extrabold text-forest">
          <Icon name="back" className="size-[19px]" flipRtl />
          {t('details.back')}
        </Link>
        <Link
          to={`/plants/${p.id}/edit`}
          aria-label={t('details.edit')}
          className="grid size-10 place-items-center rounded-xl border border-line bg-white text-forest hover:bg-sage"
        >
          <Icon name="edit" />
        </Link>
      </div>

      {/* A. Plant identity */}
      <section aria-labelledby="plant-name">
        <div className="relative mb-[21px] h-[238px] overflow-hidden rounded-[20px] bg-[#c3d9c3] min-[600px]:h-[320px] max-[390px]:h-[213px]">
          <PlantImage
            photo={p.coverPhoto}
            name={p.nickname}
            speciesImage={speciesData ? speciesImageUrl(speciesData) : null}
            speciesName={commonName ?? undefined}
            eager
            full
          />
          {p.condition !== 'unknown' && (
            <span className="absolute start-3.5 bottom-[13px] flex items-center gap-1.5 rounded-full bg-[#fffefaee] px-[11px] py-[7px] text-[11px] font-extrabold text-forest-2 shadow-[0_4px_16px_#173a2112]">
              <span
                className={`size-[7px] rounded-full ${
                  p.condition === 'healthy' ? 'bg-[#5da879]' : p.condition === 'needs-attention' ? 'bg-ochre' : 'bg-clay'
                }`}
              />
              {t(`condition.${p.condition}`)}
            </span>
          )}
        </div>
        <h1 id="plant-name" className="text-[30px] leading-[1.08] font-extrabold tracking-[-.02em]">
          <bdi>{p.nickname}</bdi>
        </h1>
        {(commonName || speciesData) && (
          <p className="mt-1 text-[13px] text-[#8a9b8c]">
            {commonName && <span dir="auto">{commonName}</span>}
            {speciesData && (
              <>
                {commonName && ' · '}
                <i dir="ltr">{speciesData.scientificName}</i>
              </>
            )}
          </p>
        )}
        <div className="mt-3.5 mb-[23px] flex flex-wrap gap-[7px]">
          {p.location && (
            <span className="flex items-center gap-[5px] rounded-full bg-[#eff4eb] px-2.5 py-[7px] text-[11px] font-extrabold text-[#52775b]">
              <Icon name="location" className="size-[15px]" />
              <span dir="auto">{p.location}</span>
            </span>
          )}
          <span className="flex items-center gap-[5px] rounded-full bg-[#f5f5ee] px-2.5 py-[7px] text-[11px] font-extrabold text-[#7d8976]">
            <Icon name="leaf" className="size-[15px]" />
            {t(`condition.${p.condition}`)}
          </span>
        </div>
      </section>

      {aiAvailable && (
        <button
          type="button"
          onClick={() => void openPlantConversation(p.id, navigate).catch((err: unknown) => toast(errorMessage(t, err)))}
          className="-mt-2 mb-[18px] flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[14px] border border-[#d7e6d6] bg-[#f2f8ef] text-[13px] font-extrabold text-forest-2 hover:bg-[#e8f2e4]"
        >
          <Icon name="sparkle" className="size-[18px]" />
          {t('assistant.ask')}
        </button>
      )}

      <WateringCard plant={p} onWatered={refreshAfterActivity} />

      {/* B. General species care guide (static catalog) */}
      <section aria-labelledby="guide-title">
        <div className="mb-[7px] flex items-center justify-between gap-2.5">
          <SectionHeading icon="book" id="guide-title">
            {t('careGuide.title')}
          </SectionHeading>
          {speciesData && (
            <span className="rounded-full border border-[#dbe8d6] bg-[#f2f7ee] px-[7px] py-[5px] text-[9px] font-extrabold whitespace-nowrap text-[#689174] uppercase rtl:normal-case">
              {t('careGuide.badge')}
            </span>
          )}
        </div>
        {!p.speciesId ? (
          <p className="mb-3.5 text-[11px] leading-relaxed text-muted">
            {p.customSpeciesName ? t('careGuide.noGuideBody', { name: p.customSpeciesName }) : t('careGuide.noSpecies')}
          </p>
        ) : species.error ? (
          <p className="mb-3.5 text-[11px] leading-relaxed text-muted">
            {t('careGuide.missingSpecies', { id: p.speciesId })}
          </p>
        ) : !speciesData ? (
          <LoadingState />
        ) : (
          <>
            <p className="mb-3.5 text-[11px] leading-relaxed text-muted">
              {t('careGuide.intro', { name: speciesData.localizations[lang].commonName })}
            </p>
            <CareGuide species={speciesData} />
          </>
        )}
      </section>

      <Separator />

      {/* C. My plant's information */}
      <section aria-labelledby="my-plant-title">
        <div className="mb-3.5">
          <SectionHeading icon="home" id="my-plant-title">
            {t('details.myPlant')}
          </SectionHeading>
        </div>
        <dl className="rounded-2xl border border-line bg-white px-3.5 py-0.5">
          <DetailRow label={t('fields.location')}>{p.location ? <span dir="auto">{p.location}</span> : notSet}</DetailRow>
          <DetailRow label={t('fields.lightExposure')}>{exposure.length ? exposure.join(' · ') : notSet}</DetailRow>
          <DetailRow label={t('fields.acquiredAt')}>
            {p.acquiredAt ? formatDate(p.acquiredAt, i18n.language) : notSet}
          </DetailRow>
          <DetailRow label={t('fields.potDiameter')}>
            {p.potDiameterCm != null ? t('common.cm', { value: formatNumber(p.potDiameterCm, i18n.language) }) : notSet}
          </DetailRow>
          <DetailRow label={t('fields.potMaterial')}>
            {p.potMaterial ? t(`potMaterial.${p.potMaterial}`) : notSet}
          </DetailRow>
          <DetailRow label={t('fields.hasDrainage')}>
            {p.hasDrainage == null ? notSet : p.hasDrainage ? t('common.yes') : t('common.no')}
          </DetailRow>
          <DetailRow label={t('fields.soilDescription')}>
            {p.soilDescription ? <span dir="auto">{p.soilDescription}</span> : notSet}
          </DetailRow>
          <DetailRow label={t('fields.condition')}>{t(`condition.${p.condition}`)}</DetailRow>
          <DetailRow label={t('fields.lastWatered')}>
            {p.lastWateredAt ? formatDate(p.lastWateredAt, i18n.language) : notSet}
          </DetailRow>
          <DetailRow label={t('fields.lastRepotted')}>
            {p.lastRepottedAt ? formatDate(p.lastRepottedAt, i18n.language) : notSet}
          </DetailRow>
        </dl>
        {p.notes && (
          <div className="mt-3 rounded-2xl border border-line bg-white px-3.5 py-3">
            <div className="mb-1 text-xs text-[#899588]">{t('fields.notes')}</div>
            <p className="text-[13px] whitespace-pre-line text-[#385340]" dir="auto">
              {p.notes}
            </p>
          </div>
        )}
      </section>

      <Separator />

      <HealthChecks
        plant={p}
        aiAvailable={aiAvailable}
        requestedPhotoId={healthPhotoId}
        onRequestHandled={() => setHealthPhotoId(null)}
        onPlantChanged={(updated) => plant.setData(updated)}
        onActivityAdded={refreshAfterActivity}
        onPhotoAdded={refreshAfterPhoto}
        after={<Separator />}
      />

      <section aria-labelledby="activity-title">
        <div className="mb-3.5">
          <SectionHeading icon="calendar" id="activity-title">
            {t('activity.title')}
          </SectionHeading>
        </div>
        {activities.error ? (
          <ErrorState error={activities.error} onRetry={activities.reload} />
        ) : !activities.data ? (
          <LoadingState />
        ) : (
          <ActivityTimeline plantId={p.id} activities={activities.data} onChanged={refreshAfterActivity} />
        )}
      </section>

      <Separator />

      <section aria-labelledby="photos-title">
        <div className="mb-3.5">
          <SectionHeading icon="camera" id="photos-title">
            {t('photos.title')}
          </SectionHeading>
        </div>
        {photos.error ? (
          <ErrorState error={photos.error} onRetry={photos.reload} />
        ) : !photos.data ? (
          <LoadingState />
        ) : (
          <PhotoGallery
            plantId={p.id}
            plantName={p.nickname}
            photos={photos.data}
            onChanged={refreshAfterPhoto}
            onCheckHealth={
              aiAvailable
                ? (photo) => {
                    setHealthPhotoId(photo.id);
                    document.getElementById('health-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                : undefined
            }
          />
        )}
      </section>

      <Separator />

      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        className="flex min-h-11 items-center gap-2 rounded-xl border border-[#f0d3ca] bg-white px-4 text-sm font-extrabold text-clay-ink hover:bg-[#fbebe6]"
      >
        <Icon name="trash" className="size-4" />
        {t('details.delete')}
      </button>

      <ConfirmDialog
        open={confirmDelete}
        title={t('details.deleteTitle', { name: p.nickname })}
        body={t('details.deleteBody')}
        confirmLabel={t('common.delete')}
        busy={deleting}
        onConfirm={() => void deletePlant()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
