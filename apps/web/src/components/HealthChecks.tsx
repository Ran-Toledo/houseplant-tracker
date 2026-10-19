import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { HealthCheck, HealthFindingKey, Language, Plant } from '@houseplant/shared';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';
import { errorMessage } from '../lib/errors';
import { formatDate } from '../lib/format';
import { AiProgress, AiTag, CONFIDENCE_STYLE } from './AiParts';
import { SectionHeading } from './CareGuide';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon, type IconName } from './Icon';
import { ErrorState, LoadingState } from './StatusViews';
import { useToast } from './Toast';

const CONDITION_DOT: Record<HealthCheck['condition'], string> = {
  healthy: 'bg-[#5da879]',
  'needs-attention': 'bg-ochre',
  unhealthy: 'bg-clay',
};

const FINDING_ICON: Record<HealthFindingKey, { icon: IconName; style: string }> = {
  overwatering: { icon: 'droplet', style: 'bg-[#e9f1fb] text-[#3d6aa3]' },
  underwatering: { icon: 'droplet', style: 'bg-[#fdf3e3] text-[#a26d1b]' },
  'root-rot': { icon: 'droplet', style: 'bg-[#fbebe6] text-clay-ink' },
  'too-little-light': { icon: 'sun', style: 'bg-[#f4f3ee] text-[#6d756c]' },
  'sun-scorch': { icon: 'sun', style: 'bg-[#fdf3e3] text-[#a26d1b]' },
  pests: { icon: 'alert', style: 'bg-[#fbebe6] text-clay-ink' },
  disease: { icon: 'alert', style: 'bg-[#fbebe6] text-clay-ink' },
  'nutrient-deficiency': { icon: 'leaf', style: 'bg-[#fdf3e3] text-[#a26d1b]' },
  'normal-ageing': { icon: 'leaf', style: 'bg-mint text-forest-2' },
  other: { icon: 'info', style: 'bg-[#f4f3ee] text-[#6d756c]' },
};

function ConditionPill({ condition, small }: { condition: HealthCheck['condition']; small?: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-white font-extrabold ${
        small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-[5px] text-xs'
      }`}
    >
      <span className={`size-2 rounded-full ${CONDITION_DOT[condition]}`} aria-hidden="true" />
      {t(`condition.${condition}`)}
    </span>
  );
}

function Thumb({ check, className }: { check: HealthCheck; className: string }) {
  const { t } = useTranslation();
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden bg-[#c3d9c3] text-[#3f7d55] ${className}`}>
      {check.photo ? (
        <img src={check.photo.thumbnailUrl} alt={t('ai.health.photoAlt')} className="size-full object-cover" />
      ) : (
        <>
          <Icon name="camera" className="size-5" />
          <span className="sr-only">{t('ai.health.photoDeleted')}</span>
        </>
      )}
    </span>
  );
}

/** The full result of one check (Screen C2). */
function HealthCheckCard({
  check,
  plant,
  onApplied,
  onDelete,
  onTreatmentLogged,
}: {
  check: HealthCheck;
  plant: Plant;
  onApplied: (plant: Plant) => void;
  onDelete: () => void;
  onTreatmentLogged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang: Language = i18n.resolvedLanguage === 'he' ? 'he' : 'en';
  const toast = useToast();
  const [applying, setApplying] = useState(false);
  const [logged, setLogged] = useState<number[]>([]);
  const a = check.assessment;

  async function apply() {
    setApplying(true);
    try {
      const res = await api.applyHealthCheck(check.id);
      toast(t('ai.health.conditionUpdated'));
      onApplied(res.plant);
    } catch (err) {
      toast(errorMessage(t, err));
    } finally {
      setApplying(false);
    }
  }

  async function logTreatment(index: number) {
    const finding = a.findings[index]!;
    const notes = t('ai.health.treatmentNote', {
      finding: t(`ai.health.findings.${finding.key}`),
      observation: finding.observation[lang],
    });
    try {
      await api.addActivity(plant.id, { activityType: 'treatment', performedAt: new Date().toISOString(), notes: notes.slice(0, 1000) });
      setLogged((l) => [...l, index]);
      toast(t('ai.health.treatmentLogged'));
      onTreatmentLogged();
    } catch (err) {
      toast(errorMessage(t, err));
    }
  }

  return (
    <div className="rounded-[18px] border border-[#dbe8d6] bg-linear-135 from-[#fbfdf9] to-[#f3f8f1] p-3.5">
      {/* The row above the card already shows the photo, date and condition. */}
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <span className={`rounded-full border px-1.5 py-px text-[10px] font-extrabold ${CONFIDENCE_STYLE[check.confidence]}`}>
          {t(`ai.confidence.${check.confidence}`)}
        </span>
        <AiTag />
      </p>
      <p className="mt-2 mb-1 text-[13px] text-[#385340]" dir="auto">
        {a.summary[lang]}
      </p>

      {a.findings.map((f, i) => (
        <div key={i} className="mt-2.5 rounded-[14px] border border-line bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[13px] font-extrabold">
              <span className={`grid size-7 place-items-center rounded-[9px] ${FINDING_ICON[f.key].style}`}>
                <Icon name={FINDING_ICON[f.key].icon} className="size-3.5" />
              </span>
              {t(`ai.health.findings.${f.key}`)}
            </span>
            <span
              className={`rounded-full px-2 py-[3px] text-[10px] font-extrabold ${
                f.likelihood === 'likely' ? 'bg-[#fdf3e3] text-[#8a5a14]' : 'bg-[#f4f3ee] text-[#6d756c]'
              }`}
            >
              {t(`ai.health.${f.likelihood}`)}
            </span>
          </div>
          <p className="mt-2 text-xs text-[#43584a]" dir="auto">
            {f.observation[lang]}
          </p>
          {f.actions.length > 0 && (
            <ul className="mt-1.5 list-disc ps-[18px] text-xs text-[#385340]">
              {f.actions.map((action, j) => (
                <li key={j} className="mt-[3px]" dir="auto">
                  {action[lang]}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => void logTreatment(i)}
            disabled={logged.includes(i)}
            className="mt-2 inline-flex min-h-[34px] items-center gap-1.5 rounded-[10px] border border-line bg-white px-2.5 text-[11.5px] font-extrabold text-forest hover:bg-sage disabled:opacity-60"
          >
            <Icon name={logged.includes(i) ? 'check' : 'plus'} className="size-3.5" />
            {logged.includes(i) ? t('ai.health.treatmentLogged') : t('ai.health.logTreatment')}
          </button>
        </div>
      ))}

      {a.photoQualityIssue !== 'none' && (
        <p className="mt-2.5 flex items-start gap-2 rounded-xl border border-[#f0dcc0] bg-[#fdf3e3] px-2.5 py-2 text-[11.5px] text-[#8a5a14]">
          <Icon name="alert" className="mt-px size-3.5" />
          {t(`ai.health.quality.${a.photoQualityIssue}`)}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {check.appliedAt ? (
          <span className="flex min-h-11 flex-1 items-center gap-1.5 text-[13px] font-extrabold text-forest-2">
            <Icon name="check" className="size-4" />
            {t('ai.health.conditionUpdated')}
          </span>
        ) : plant.condition !== check.condition ? (
          <button
            type="button"
            onClick={() => void apply()}
            disabled={applying}
            className="min-h-11 flex-1 rounded-xl bg-forest-2 px-3 text-[13px] font-extrabold text-white hover:bg-forest disabled:opacity-70"
          >
            {applying ? t('common.saving') : t('ai.health.apply', { condition: t(`condition.${check.condition}`) })}
          </button>
        ) : (
          <span className="flex-1" />
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('ai.health.delete')}
          className="grid size-11 place-items-center rounded-xl border border-[#f0d3ca] bg-white text-clay-ink hover:bg-[#fbebe6]"
        >
          <Icon name="trash" className="size-4" />
        </button>
      </div>
      <p className="mt-2.5 flex items-start gap-1.5 text-[11px] text-muted">
        <Icon name="info" className="mt-px size-3.5" />
        {t('ai.health.disclaimer')}
      </p>
    </div>
  );
}

/**
 * The plant page's Health checks section (Screens C2 and C3): run a check on
 * the cover photo (or a new one), and browse past results.
 */
export function HealthChecks({
  plant,
  aiAvailable,
  requestedPhotoId,
  onRequestHandled,
  onPlantChanged,
  onActivityAdded,
  onPhotoAdded,
  after,
}: {
  plant: Plant;
  aiAvailable: boolean;
  /** A photo to check now, e.g. chosen in the photo viewer. */
  requestedPhotoId: string | null;
  onRequestHandled: () => void;
  onPlantChanged: (plant: Plant) => void;
  onActivityAdded: () => void;
  onPhotoAdded: () => void;
  /** Rendered after the section, only when the section is shown (e.g. a separator). */
  after?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const lang: Language = i18n.resolvedLanguage === 'he' ? 'he' : 'en';
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const checks = useAsync(() => api.listHealthChecks(plant.id), [plant.id]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HealthCheck | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function run(photoId: string) {
    setRunning(true);
    setError(undefined);
    try {
      const check = await api.createHealthCheck(plant.id, photoId);
      setOpenId(check.id);
      checks.setData([check, ...(checks.data ?? [])]);
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setRunning(false);
    }
  }

  async function runWithNewPhoto(file: File) {
    try {
      const photo = await api.uploadPhoto(plant.id, file);
      onPhotoAdded();
      await run(photo.id);
    } catch (err) {
      setError(errorMessage(t, err));
    }
  }

  useEffect(() => {
    if (!requestedPhotoId) return;
    onRequestHandled();
    void run(requestedPhotoId);
  }, [requestedPhotoId]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteHealthCheck(pendingDelete.id);
      toast(t('ai.health.deleted'));
      checks.setData((checks.data ?? []).filter((c) => c.id !== pendingDelete.id));
    } catch (err) {
      toast(errorMessage(t, err));
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  const list = checks.data ?? [];
  // Past checks stay visible when AI is off; the section only disappears when there's nothing to show or do.
  if (!aiAvailable && list.length === 0) return null;

  return (
    <>
      <section aria-labelledby="health-title" className="mb-1">
        <div className="mb-3.5 flex items-center justify-between gap-2.5">
          <SectionHeading icon="sparkle" id="health-title">
            {t('ai.health.title')}
          </SectionHeading>
          {aiAvailable && (
            <button
              type="button"
              disabled={running}
              onClick={() => (plant.coverPhoto ? void run(plant.coverPhoto.id) : fileInput.current?.click())}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#d7e6d6] bg-[#f2f8ef] px-3 text-xs font-extrabold text-forest-2 hover:bg-[#e8f2e4] disabled:opacity-60"
            >
              <Icon name="camera" className="size-3.5" />
              {t('ai.health.check')}
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void runWithNewPhoto(file);
            }}
          />
        </div>

        {running && (
          <div className="mb-3 rounded-[18px] border border-[#dbe8d6] bg-white p-3">
            <div className="mb-2.5 text-[13px] font-extrabold">{t('ai.health.running')}</div>
            <AiProgress>{t('ai.health.runningBody')}</AiProgress>
          </div>
        )}
        {error && (
          <p role="alert" className="mb-3 rounded-xl bg-[#fdf6f3] px-3.5 py-2.5 text-[13px] text-clay-ink">
            {error}
          </p>
        )}

        {checks.error ? (
          <ErrorState error={checks.error} onRetry={checks.reload} />
        ) : !checks.data ? (
          <LoadingState />
        ) : list.length === 0 ? (
          !running && <p className="text-[13px] text-muted">{aiAvailable ? t('ai.health.empty') : t('ai.health.emptyNoAi')}</p>
        ) : (
          <ul className="rounded-2xl border border-line bg-white">
            {list.map((check) => {
              const open = check.id === openId;
              return (
                <li key={check.id} className="border-t border-[#eff1e9] first:border-t-0">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={open ? undefined : t('ai.health.open')}
                    onClick={() => setOpenId(open ? null : check.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-start"
                  >
                    <Thumb check={check} className="size-11 rounded-[10px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] text-muted">{formatDate(check.createdAt, i18n.language)}</span>
                      <span className="flex items-center gap-1.5">
                        <ConditionPill condition={check.condition} small />
                        {check.appliedAt && <span className="text-[10px] font-extrabold text-[#2f6a45]">{t('ai.health.applied')}</span>}
                      </span>
                      {!open && (
                        <span className="block truncate text-xs text-[#385340]" dir="auto">
                          {check.assessment.summary[lang]}
                        </span>
                      )}
                    </span>
                    <Icon name="chevron" className={`size-4 text-subtle transition ${open ? 'rotate-90' : ''}`} flipRtl={!open} />
                  </button>
                  {open && (
                    <div className="px-2 pb-2">
                      <HealthCheckCard
                        check={check}
                        plant={plant}
                        onApplied={(updated) => {
                          checks.reload();
                          onPlantChanged(updated);
                        }}
                        onDelete={() => setPendingDelete(check)}
                        onTreatmentLogged={onActivityAdded}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <ConfirmDialog
          open={pendingDelete !== null}
          title={t('ai.health.deleteConfirm')}
          confirmLabel={t('common.delete')}
          busy={deleting}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      </section>
      {after}
    </>
  );
}
