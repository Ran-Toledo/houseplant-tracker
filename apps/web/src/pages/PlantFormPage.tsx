import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  CONDITIONS,
  LIGHT_EXPOSURES,
  POT_MATERIALS,
  WINDOW_ORIENTATIONS,
  type ActivityInput,
  type Condition,
  type Plant,
  type PlantCreateInput,
} from '@houseplant/shared';
import { api, ApiRequestError } from '../api';
import { Icon } from '../components/Icon';
import { NOT_IN_CATALOG, SpeciesPicker } from '../components/SpeciesPicker';
import { ErrorState, LoadingState } from '../components/StatusViews';
import { useToast } from '../components/Toast';
import { useAsync } from '../hooks/useAsync';
import { useSpeciesCatalog } from '../hooks/useSpecies';
import { errorMessage, isNotFound } from '../lib/errors';
import { dateInputToTimestamp, toDateInputValue } from '../lib/format';
import { NotFoundPage } from './NotFoundPage';

/** Form state: everything is a string so inputs stay controlled; converted on submit. */
interface FormValues {
  nickname: string;
  species: string; // species id, NOT_IN_CATALOG, or ''
  customSpeciesName: string;
  location: string;
  lightExposure: string;
  windowOrientation: string;
  acquiredAt: string;
  potDiameterCm: string;
  potMaterial: string;
  hasDrainage: '' | 'yes' | 'no';
  soilDescription: string;
  condition: Condition;
  notes: string;
  lastWateredOn: string;
  lastRepottedOn: string;
}

type FieldErrors = Partial<Record<keyof FormValues, string>>;

const EMPTY: FormValues = {
  nickname: '',
  species: '',
  customSpeciesName: '',
  location: '',
  lightExposure: '',
  windowOrientation: '',
  acquiredAt: '',
  potDiameterCm: '',
  potMaterial: '',
  hasDrainage: '',
  soilDescription: '',
  condition: 'unknown',
  notes: '',
  lastWateredOn: '',
  lastRepottedOn: '',
};

function fromPlant(p: Plant): FormValues {
  return {
    ...EMPTY,
    nickname: p.nickname,
    species: p.speciesId ?? (p.customSpeciesName ? NOT_IN_CATALOG : ''),
    customSpeciesName: p.customSpeciesName ?? '',
    location: p.location ?? '',
    lightExposure: p.lightExposure ?? '',
    windowOrientation: p.windowOrientation ?? '',
    acquiredAt: p.acquiredAt ?? '',
    potDiameterCm: p.potDiameterCm != null ? String(p.potDiameterCm) : '',
    potMaterial: p.potMaterial ?? '',
    hasDrainage: p.hasDrainage == null ? '' : p.hasDrainage ? 'yes' : 'no',
    soilDescription: p.soilDescription ?? '',
    condition: p.condition,
    notes: p.notes ?? '',
  };
}

/** Accepts "22", "22.5" and "22,5". */
const parseDiameter = (raw: string) => Number(raw.trim().replace(',', '.'));

function validateForm(v: FormValues, t: (key: string) => string): FieldErrors {
  const errors: FieldErrors = {};
  if (!v.nickname.trim()) errors.nickname = t('form.required');
  if (v.potDiameterCm.trim()) {
    const n = parseDiameter(v.potDiameterCm);
    if (!Number.isFinite(n) || n <= 0 || n > 500) errors.potDiameterCm = t('form.invalidNumber');
  }
  return errors;
}

function toPayload(v: FormValues) {
  const orNull = (s: string) => (s.trim() === '' ? null : s.trim());
  const isCustom = v.species === NOT_IN_CATALOG;
  return {
    nickname: v.nickname.trim(),
    speciesId: v.species && !isCustom ? v.species : null,
    customSpeciesName: isCustom ? orNull(v.customSpeciesName) : null,
    location: orNull(v.location),
    lightExposure: (orNull(v.lightExposure) as PlantCreateInput['lightExposure']) ?? null,
    windowOrientation: (orNull(v.windowOrientation) as PlantCreateInput['windowOrientation']) ?? null,
    acquiredAt: orNull(v.acquiredAt),
    potDiameterCm: v.potDiameterCm.trim() ? parseDiameter(v.potDiameterCm) : null,
    potMaterial: (orNull(v.potMaterial) as PlantCreateInput['potMaterial']) ?? null,
    hasDrainage: v.hasDrainage === '' ? null : v.hasDrainage === 'yes',
    soilDescription: orNull(v.soilDescription),
    condition: v.condition,
    notes: v.notes.trim() === '' ? null : v.notes,
  };
}

const inputClass =
  'block min-h-12 w-full rounded-xl border border-line bg-white px-3 text-ink outline-none placeholder:text-[#a3afa6] focus:border-[#83b998] aria-invalid:border-clay';

function Field({
  label,
  htmlFor,
  error,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-extrabold text-[#55695b]">
        {label}
        {optional === false && <span className="text-clay-ink"> *</span>}
        {optional && <span className="font-normal text-subtle"> ({t('common.optional')})</span>}
      </label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1 text-xs font-bold text-clay-ink">
          {error}
        </p>
      )}
    </div>
  );
}

function FormSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="mb-7 space-y-4">
      <legend className="mb-3 text-[17px] font-bold tracking-tight">{title}</legend>
      {hint && <p className="-mt-2 text-xs text-muted">{hint}</p>}
      {children}
    </fieldset>
  );
}

/** Add-plant and edit-plant form. `/plants/new` creates; `/plants/:id/edit` edits. */
export function PlantFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const existing = useAsync(() => (id ? api.getPlant(id) : Promise.resolve(null)), [id]);

  if (existing.error) {
    if (isNotFound(existing.error)) return <NotFoundPage />;
    return <ErrorState error={existing.error} onRetry={existing.reload} />;
  }
  if (editing && !existing.data) return <LoadingState />;
  return <PlantForm plant={existing.data ?? null} key={existing.data?.id ?? 'new'} />;
}

function PlantForm({ plant }: { plant: Plant | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const catalog = useSpeciesCatalog();
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;

  const [values, setValues] = useState<FormValues>(() => (plant ? fromPlant(plant) : EMPTY));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>();

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const inputProps = (name: keyof FormValues) => ({
    id: fid(name),
    name,
    value: values[name] as string,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${fid(name)}-error` : undefined,
    onChange: (e: { target: { value: string } }) => set(name, e.target.value as never),
    className: inputClass,
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clientErrors = validateForm(values, t);
    setErrors(clientErrors);
    setFormError(undefined);
    if (Object.keys(clientErrors).length > 0) {
      document.getElementById(fid(Object.keys(clientErrors)[0]!))?.focus();
      return;
    }

    setSaving(true);
    try {
      const payload = toPayload(values);
      let saved: Plant;
      if (plant) {
        saved = await api.updatePlant(plant.id, payload);
        toast(t('form.saved'));
      } else {
        const initialActivities: ActivityInput[] = [];
        if (values.lastWateredOn)
          initialActivities.push({ activityType: 'watering', performedAt: dateInputToTimestamp(values.lastWateredOn) });
        if (values.lastRepottedOn)
          initialActivities.push({ activityType: 'repotting', performedAt: dateInputToTimestamp(values.lastRepottedOn) });
        saved = await api.createPlant({ ...payload, initialActivities });
        toast(t('form.created'));
        if (photo) {
          try {
            await api.uploadPhoto(saved.id, photo, { isCover: true });
          } catch (err) {
            toast(t('form.photoFailed', { reason: errorMessage(t, err) }));
          }
        }
      }
      navigate(`/plants/${saved.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError && err.details) {
        const serverErrors: FieldErrors = {};
        for (const d of err.details) {
          const key = (d.path === 'speciesId' ? 'species' : d.path) as keyof FormValues;
          if (key in EMPTY) serverErrors[key] = t('form.invalidValue');
        }
        setErrors(serverErrors);
      }
      setFormError(errorMessage(t, err));
      setSaving(false);
    }
  }

  const today = toDateInputValue();
  const backTo = plant ? `/plants/${plant.id}` : '/';

  return (
    <form onSubmit={submit} noValidate>
      <div className="-mt-1.5 mb-4">
        <Link to={backTo} className="inline-flex min-h-10 items-center gap-1.5 text-xs font-extrabold text-forest">
          <Icon name="back" className="size-[19px]" flipRtl />
          {plant ? <span dir="auto">{plant.nickname}</span> : t('details.back')}
        </Link>
      </div>
      <h1 className="mb-6 text-[30px] leading-[1.08] font-extrabold tracking-[-.055em]">
        {plant ? t('form.editTitle') : t('form.addTitle')}
      </h1>

      <FormSection title={t('form.sectionPlant')}>
        <Field label={t('fields.nickname')} htmlFor={fid('nickname')} error={errors.nickname} optional={false}>
          <input
            {...inputProps('nickname')}
            required
            maxLength={100}
            dir="auto"
            autoComplete="off"
            placeholder={t('form.nicknamePlaceholder')}
          />
        </Field>
        <div>
          <div id={fid('species-label')} className="mb-1.5 text-xs font-extrabold text-[#55695b]">
            {t('fields.species')} <span className="font-normal text-subtle">({t('common.optional')})</span>
          </div>
          {catalog.error ? (
            <ErrorState error={catalog.error} onRetry={catalog.reload} />
          ) : (
            <SpeciesPicker
              species={catalog.species}
              value={values.species}
              onChange={(v) => set('species', v)}
              labelledBy={fid('species-label')}
            />
          )}
          {errors.species && <p className="mt-1 text-xs font-bold text-clay-ink">{errors.species}</p>}
        </div>
        {values.species === NOT_IN_CATALOG && (
          <Field label={t('fields.customSpeciesName')} htmlFor={fid('customSpeciesName')} optional>
            <input
              {...inputProps('customSpeciesName')}
              maxLength={100}
              dir="auto"
              placeholder={t('form.customSpeciesPlaceholder')}
            />
          </Field>
        )}
        <Field label={t('fields.condition')} htmlFor={fid('condition')}>
          <select {...inputProps('condition')}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {t(`condition.${c}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('fields.acquiredAt')} htmlFor={fid('acquiredAt')} optional>
          <input {...inputProps('acquiredAt')} type="date" max={today} />
        </Field>
        {!plant && (
          <div>
            <div className="mb-1.5 text-xs font-extrabold text-[#55695b]">
              {t('form.photo')} <span className="font-normal text-subtle">({t('common.optional')})</span>
            </div>
            <div className="flex items-center gap-3">
              {photoPreview && (
                <img src={photoPreview} alt="" className="size-20 shrink-0 rounded-xl object-cover" />
              )}
              <div className="flex flex-wrap gap-2">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-extrabold text-forest hover:bg-sage">
                  <Icon name="camera" className="size-4" />
                  {photo ? t('form.changePhoto') : t('form.choosePhoto')}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  />
                </label>
                {photo && (
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    className="min-h-11 rounded-xl px-3 text-sm font-bold text-clay-ink hover:bg-[#fbebe6]"
                  >
                    {t('form.removePhoto')}
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1.5 text-xs text-muted">{t('form.photoHint')}</p>
          </div>
        )}
      </FormSection>

      <FormSection title={t('form.sectionConditions')}>
        <Field label={t('fields.location')} htmlFor={fid('location')} optional>
          <input {...inputProps('location')} maxLength={100} dir="auto" placeholder={t('form.locationPlaceholder')} />
        </Field>
        <div className="grid gap-4 min-[480px]:grid-cols-2">
          <Field label={t('fields.lightExposure')} htmlFor={fid('lightExposure')} optional>
            <select {...inputProps('lightExposure')}>
              <option value="">{t('form.select')}</option>
              {LIGHT_EXPOSURES.map((l) => (
                <option key={l} value={l}>
                  {t(`light.${l}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('fields.windowOrientation')} htmlFor={fid('windowOrientation')} optional>
            <select {...inputProps('windowOrientation')}>
              <option value="">{t('form.select')}</option>
              {WINDOW_ORIENTATIONS.map((o) => (
                <option key={o} value={o}>
                  {t(`orientation.${o}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FormSection>

      <FormSection title={t('form.sectionPot')}>
        <div className="grid gap-4 min-[480px]:grid-cols-2">
          <Field label={t('fields.potDiameterCm')} htmlFor={fid('potDiameterCm')} error={errors.potDiameterCm} optional>
            <input {...inputProps('potDiameterCm')} inputMode="decimal" autoComplete="off" />
          </Field>
          <Field label={t('fields.potMaterial')} htmlFor={fid('potMaterial')} optional>
            <select {...inputProps('potMaterial')}>
              <option value="">{t('form.select')}</option>
              {POT_MATERIALS.map((m) => (
                <option key={m} value={m}>
                  {t(`potMaterial.${m}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t('fields.hasDrainage')} htmlFor={fid('hasDrainage')} optional>
          <select {...inputProps('hasDrainage')}>
            <option value="">{t('common.unknown')}</option>
            <option value="yes">{t('common.yes')}</option>
            <option value="no">{t('common.no')}</option>
          </select>
        </Field>
        <Field label={t('fields.soilDescription')} htmlFor={fid('soilDescription')} optional>
          <input {...inputProps('soilDescription')} maxLength={500} dir="auto" placeholder={t('form.soilPlaceholder')} />
        </Field>
        <Field label={t('fields.notes')} htmlFor={fid('notes')} optional>
          <textarea
            {...inputProps('notes')}
            rows={4}
            maxLength={5000}
            dir="auto"
            placeholder={t('form.notesPlaceholder')}
            className={`${inputClass} py-2.5`}
          />
        </Field>
      </FormSection>

      {!plant && (
        <FormSection title={t('form.sectionHistory')} hint={t('form.historyHint')}>
          <div className="grid gap-4 min-[480px]:grid-cols-2">
            <Field label={t('fields.lastWatered')} htmlFor={fid('lastWateredOn')} optional>
              <input {...inputProps('lastWateredOn')} type="date" max={today} />
            </Field>
            <Field label={t('fields.lastRepotted')} htmlFor={fid('lastRepottedOn')} optional>
              <input {...inputProps('lastRepottedOn')} type="date" max={today} />
            </Field>
          </div>
        </FormSection>
      )}

      {formError && (
        <p role="alert" className="mb-4 rounded-xl bg-[#fdf6f3] px-4 py-3 text-sm text-clay-ink">
          {formError}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Link
          to={backTo}
          className="flex min-h-12 items-center rounded-xl border border-line bg-white px-5 font-bold text-ink hover:bg-sage"
        >
          {t('common.cancel')}
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="min-h-12 rounded-xl bg-forest-2 px-6 font-extrabold text-white hover:bg-forest disabled:opacity-70"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}
