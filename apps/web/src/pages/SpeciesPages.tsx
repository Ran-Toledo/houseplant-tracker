import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { speciesImageUrl } from '@houseplant/shared';
import { api } from '../api';
import { CareGuide } from '../components/CareGuide';
import { Icon } from '../components/Icon';
import { ErrorState, LoadingState } from '../components/StatusViews';
import { useAsync } from '../hooks/useAsync';
import { useSpeciesCatalog } from '../hooks/useSpecies';
import { isNotFound } from '../lib/errors';
import { NotFoundPage } from './NotFoundPage';

/** Browsable list of catalog species. */
export function SpeciesListPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage === 'he' ? 'he' : 'en';
  const catalog = useSpeciesCatalog();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return catalog.species;
    return catalog.species.filter((s) =>
      [s.scientificName, ...Object.values(s.names).flatMap((n) => [n.commonName, ...n.alternateNames])].some((n) =>
        n.toLocaleLowerCase().includes(needle),
      ),
    );
  }, [catalog.species, query]);

  return (
    <>
      <section className="mb-6">
        <div className="flex items-center justify-between gap-2.5">
          <h1 className="text-[37px] leading-[1.08] font-extrabold tracking-[-.055em]">{t('species.title')}</h1>
          {catalog.species.length > 0 && (
            <span className="rounded-[20px] border border-[#dde8dc] bg-[#eaf4e7] px-[11px] py-2 text-[11px] font-extrabold whitespace-nowrap text-forest-2">
              {t('species.count', { count: catalog.species.length })}
            </span>
          )}
        </div>
        <p className="mt-2.5 text-[13px] text-muted">{t('species.subtitle')}</p>
      </section>

      <label className="mb-5 flex items-center gap-[11px] rounded-[14px] border border-line bg-[#f5f7f2] px-3.5 py-[11px] text-[#829387] focus-within:border-[#83b998] focus-within:bg-white">
        <Icon name="search" />
        <span className="sr-only">{t('species.searchLabel')}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('species.search')}
          autoComplete="off"
          className="w-full min-w-0 border-0 bg-transparent text-ink outline-none placeholder:text-[#829387]"
        />
      </label>

      {catalog.error ? (
        <ErrorState error={catalog.error} onRetry={catalog.reload} />
      ) : catalog.loading && catalog.species.length === 0 ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-[#d3dfd3] p-6 text-center text-xs text-[#788b7c]">
          {t('species.empty')}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line bg-white">
          {filtered.map((s) => (
            <li key={s.id} className="border-b border-line-soft last:border-b-0">
              <Link to={`/species/${s.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-[#f7f9f4]">
                {s.imageUrl ? (
                  <img
                    src={s.imageUrl}
                    alt=""
                    decoding="async"
                    className="size-14 shrink-0 rounded-xl bg-sage object-cover"
                  />
                ) : (
                  <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-[#eff4e9] text-[#478259]">
                    <Icon name="leaf" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold">{s.names[lang].commonName}</span>
                  <i className="block truncate text-xs text-subtle">
                    <bdi>{s.scientificName}</bdi>
                  </i>
                </span>
                <Icon name="chevron" className="size-4 text-muted" flipRtl />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** One species' full care guide. */
export function SpeciesDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage === 'he' ? 'he' : 'en';
  const species = useAsync(() => api.getSpecies(id), [id]);

  if (species.error) {
    if (isNotFound(species.error)) return <NotFoundPage />;
    return <ErrorState error={species.error} onRetry={species.reload} />;
  }
  if (!species.data) return <LoadingState />;
  const s = species.data;
  const loc = s.localizations[lang];
  const imageUrl = speciesImageUrl(s);

  return (
    <>
      <div className="-mt-1.5 mb-[15px]">
        <Link to="/species" className="inline-flex min-h-10 items-center gap-1.5 text-xs font-extrabold text-forest">
          <Icon name="back" className="size-[19px]" flipRtl />
          {t('species.backToList')}
        </Link>
      </div>
      {imageUrl && s.image && (
        <figure className="mb-[21px]">
          <div className="h-[238px] overflow-hidden rounded-[20px] bg-sage min-[600px]:h-[320px] max-[390px]:h-[213px]">
            <img
              src={imageUrl}
              alt={t('photos.speciesAlt', { name: loc.commonName })}
              className="block size-full object-cover"
            />
          </div>
          <figcaption className="mt-1.5 text-[10px] text-subtle">
            <a href={s.image.sourceUrl} target="_blank" rel="noreferrer noopener" className="hover:underline">
              {t('careGuide.photoCredit', { author: s.image.author, license: s.image.license })}
            </a>
          </figcaption>
        </figure>
      )}
      <h1 className="text-[30px] leading-[1.08] font-extrabold tracking-[-.055em]">{loc.commonName}</h1>
      <p className="mt-1 text-[13px] text-[#8a9b8c]">
        <i dir="ltr">{s.scientificName}</i> · <span dir="ltr">{s.family}</span>
      </p>
      {loc.alternateNames.length > 0 && (
        <p className="mt-1 text-xs text-muted">{loc.alternateNames.join(' · ')}</p>
      )}
      <p className="mt-4 text-[13px] leading-relaxed text-[#43584a]">{loc.description}</p>
      <p className="mt-2 mb-5 text-[13px] leading-relaxed text-[#43584a]">{loc.appearance}</p>
      <CareGuide species={s} />
    </>
  );
}
