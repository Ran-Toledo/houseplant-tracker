import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IdentificationCandidate, Identification, Language, Photo, SpeciesSummary } from '@houseplant/shared';
import { api } from '../api';
import { errorMessage } from '../lib/errors';
import { AiTag, AiProgress, CONFIDENCE_STYLE } from './AiParts';
import { Icon } from './Icon';

/** The photo to identify: a file chosen in the form, or a stored photo. */
export type IdentifySource = { file: File } | { photo: Photo } | null;

/**
 * "Identify from photo" in the plant form (Screen C1). Shows up to three
 * candidates; choosing one only fills the form, nothing is saved here. An
 * identified file becomes the form's photo and is saved with the plant.
 */
export function IdentifyPanel({
  source,
  species,
  onChoose,
  onFileIdentified,
}: {
  source: IdentifySource;
  species: SpeciesSummary[];
  onChoose: (candidate: IdentificationCandidate) => void;
  /** Called with a file once it has been identified, so the form keeps it as the plant photo. */
  onFileIdentified?: (file: File) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang: Language = i18n.resolvedLanguage === 'he' ? 'he' : 'en';
  const fileInput = useRef<HTMLInputElement>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Identification | null>(null);
  const [error, setError] = useState<string>();
  const [chosen, setChosen] = useState(false);

  async function identify(next: IdentifySource) {
    if (!next) {
      fileInput.current?.click();
      return;
    }
    setRunning(true);
    setResult(null);
    setError(undefined);
    setChosen(false);
    try {
      const res = 'file' in next ? await api.identifyUpload(next.file) : await api.identifyPhoto(next.photo.id);
      setResult(res.identification);
      if ('file' in next) onFileIdentified?.(next.file);
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setRunning(false);
    }
  }

  const hint = !source ? t('ai.identify.hintNone') : 'file' in source ? t('ai.identify.hintPhoto') : t('ai.identify.hintCover');
  const imageOf = (id: string | null) => (id ? species.find((s) => s.id === id)?.imageUrl : null);

  return (
    <div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => void identify(source)}
          disabled={running}
          className="inline-flex min-h-[42px] items-center gap-[7px] rounded-xl border border-[#d7e6d6] bg-[#f2f8ef] px-3.5 text-[13px] font-extrabold text-forest-2 hover:bg-[#e8f2e4] disabled:opacity-60"
        >
          <Icon name="sparkle" className="size-4" />
          {t('ai.identify.button')}
        </button>
        {source && (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={running}
            className="min-h-10 text-xs font-bold text-forest underline-offset-2 hover:underline disabled:opacity-60"
          >
            {t('ai.identify.otherPhoto')}
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
            if (file) void identify({ file });
          }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted">{hint}</p>

      {running && (
        <div className="mt-3 rounded-2xl border border-[#dbe8d6] bg-white p-3 shadow-card">
          <div className="mb-2.5 text-[13px] font-extrabold">{t('ai.identify.running')}</div>
          <AiProgress>{t('ai.identify.runningBody')}</AiProgress>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-[#fdf6f3] px-3.5 py-2.5 text-[13px] text-clay-ink">
          {error}
        </p>
      )}

      {result && (
        <section aria-label={t('ai.identify.title')} className="mt-3 rounded-2xl border border-[#dbe8d6] bg-white p-3 shadow-card">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="text-[13px] font-extrabold">{t('ai.identify.title')}</span>
              <AiTag />
            </span>
            <button
              type="button"
              onClick={() => setResult(null)}
              aria-label={t('ai.identify.close')}
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sage"
            >
              <Icon name="close" className="size-4" />
            </button>
          </div>

          {result.notAPlant || result.candidates.length === 0 ? (
            <p className="py-2 text-[13px] text-[#43584a]">
              {result.notAPlant ? t('ai.identify.notAPlant') : t('ai.identify.noMatches')}
            </p>
          ) : (
            <ul>
              {result.candidates.map((c, i) => {
                const image = imageOf(c.catalogSpeciesId);
                return (
                  <li key={i} className="flex gap-2.5 border-t border-[#eff1e9] px-1 py-2.5 first:border-t-0">
                    <div className="grid size-[52px] shrink-0 place-items-center overflow-hidden rounded-xl bg-[#c3d9c3] text-[#3f7d55]">
                      {image ? <img src={image} alt="" className="size-full object-cover" /> : <Icon name="leaf" className="size-6" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm font-extrabold" dir="auto">
                        {c.commonName[lang]}
                      </span>
                      <i className="block text-xs text-subtle" dir="ltr">
                        {c.scientificName}
                      </i>
                      <div className="my-1.5 flex flex-wrap gap-[5px]">
                        <span className={`rounded-full border px-2 py-[3px] text-[10px] font-extrabold ${CONFIDENCE_STYLE[c.confidence]}`}>
                          {t(`ai.confidence.${c.confidence}`)}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-[3px] text-[10px] font-extrabold ${
                            c.catalogSpeciesId ? 'border-[#dbe8d6] bg-[#f2f7ee] text-[#689174]' : 'border-line bg-white text-muted'
                          }`}
                        >
                          {c.catalogSpeciesId ? t('ai.identify.inCatalog') : t('ai.identify.notInCatalog')}
                        </span>
                      </div>
                      <p className="text-xs text-[#55695b]" dir="auto">
                        {c.reason[lang]}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          onChoose(c);
                          setChosen(true);
                        }}
                        className={`mt-2 min-h-9 rounded-[10px] px-3 text-xs font-extrabold ${
                          c.catalogSpeciesId
                            ? 'bg-forest-2 text-white hover:bg-forest'
                            : 'border border-line bg-white text-forest hover:bg-sage'
                        }`}
                      >
                        {c.catalogSpeciesId ? t('ai.identify.useSpecies') : t('ai.identify.useName')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {chosen && (
            <p role="status" className="mt-1 text-xs font-bold text-forest-2">
              {t('ai.identify.chosen')}
            </p>
          )}
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted">
            <Icon name="info" className="mt-px size-3.5" />
            {t('ai.identify.note')}
          </p>
        </section>
      )}
    </div>
  );
}
