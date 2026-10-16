import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Condition } from '@houseplant/shared';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { AddPlantCard, PlantCard } from '../components/PlantCard';
import { EmptyState, ErrorState, LoadingState } from '../components/StatusViews';
import { useAsync } from '../hooks/useAsync';
import { useSpeciesCatalog } from '../hooks/useSpecies';

const CONDITION_FILTERS: (Condition | 'all')[] = ['all', 'healthy', 'needs-attention', 'unhealthy'];

/** Debounces a rapidly changing value (the search box). */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Screen A — the plant collection gallery. Filters live in the URL so Back restores them. */
export function PlantListPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounced(search.trim(), 250);
  const condition = (params.get('condition') as Condition | null) ?? undefined;
  const location = params.get('location') ?? undefined;
  const catalog = useSpeciesCatalog();

  const plants = useAsync(() => api.listPlants({ q, condition, location }), [q, condition, location]);
  const total = useAsync(() => api.listPlants(), []);
  const locations = useAsync(() => api.listLocations(), []);

  const updateParam = (key: string, value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  // Mirror the (debounced) search text into the URL.
  useEffect(() => {
    updateParam('q', q || undefined);
  }, [q]);

  const filtering = Boolean(q || condition || location);
  const collectionEmpty = total.data?.length === 0;
  const count = total.data?.length ?? 0;

  return (
    <>
      <section className="mb-6">
        <p className="mb-[7px] text-[10px] font-extrabold tracking-[.16em] text-forest-2 uppercase rtl:tracking-normal">
          {t('collection.eyebrow')}
        </p>
        <div className="flex items-center justify-between gap-2.5">
          <h1 className="text-[37px] leading-[1.08] font-extrabold tracking-[-.02em]">{t('collection.title')}</h1>
          {total.data && (
            <span className="rounded-[20px] border border-[#dde8dc] bg-[#eaf4e7] px-[11px] py-2 text-[11px] font-extrabold whitespace-nowrap text-forest-2">
              {t('collection.count', { count })}
            </span>
          )}
        </div>
        <p className="mt-2.5 text-[13px] text-muted">{t('collection.subtitle')}</p>
      </section>

      {!collectionEmpty && (
        <>
          <label className="mb-[17px] flex items-center gap-[11px] rounded-[14px] border border-line bg-[#f5f7f2] px-3.5 py-[11px] text-[#829387] focus-within:border-[#83b998] focus-within:bg-white">
            <Icon name="search" />
            <span className="sr-only">{t('collection.searchLabel')}</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('collection.search')}
              autoComplete="off"
              enterKeyHint="search"
              className="w-full min-w-0 border-0 bg-transparent text-ink outline-none placeholder:text-[#829387]"
            />
          </label>

          <div
            role="group"
            aria-label={t('collection.filters')}
            className="scrollbar-none -mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-[3px]"
          >
            {CONDITION_FILTERS.map((value) => {
              const selected = (condition ?? 'all') === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => updateParam('condition', value === 'all' ? undefined : value)}
                  className={`min-h-9 rounded-full border px-[13px] text-[11px] font-bold whitespace-nowrap ${
                    selected ? 'border-forest bg-forest text-white' : 'border-[#e1e9e0] bg-white text-[#657869] hover:border-forest-2'
                  }`}
                >
                  {value === 'all' ? t('collection.allPlants') : t(`condition.${value}`)}
                </button>
              );
            })}
          </div>

          <div className="mb-[13px] flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-bold tracking-tight">{t('collection.heading')}</h2>
            {locations.data && locations.data.length > 0 ? (
              <label className="flex min-w-0 items-center gap-1 text-[11px] font-bold text-muted">
                <Icon name="location" className="size-[15px]" />
                <span className="sr-only">{t('collection.locationFilter')}</span>
                <select
                  value={location ?? ''}
                  onChange={(e) => updateParam('location', e.target.value || undefined)}
                  className="max-w-40 min-w-0 truncate rounded-lg bg-transparent py-1 text-[11px]! font-bold text-muted outline-none"
                >
                  <option value="">{t('collection.allLocations')}</option>
                  {locations.data.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-bold text-muted">
                <Icon name="calendar" className="size-[15px]" />
                {t('collection.sort')}
              </span>
            )}
          </div>
        </>
      )}

      {plants.error ? (
        <ErrorState error={plants.error} onRetry={plants.reload} />
      ) : !plants.data ? (
        <LoadingState />
      ) : collectionEmpty ? (
        <EmptyState
          title={t('collection.emptyTitle')}
          body={t('collection.emptyBody')}
          action={
            <Link
              to="/plants/new"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest-2 px-5 font-extrabold text-white hover:bg-forest"
            >
              <Icon name="plus" className="size-4" />
              {t('collection.addPlant')}
            </Link>
          }
        />
      ) : (
        <>
          <section
            aria-label={t('collection.gallery')}
            aria-busy={plants.loading}
            className="grid grid-cols-2 gap-[13px] min-[600px]:grid-cols-3 max-[390px]:gap-2.5"
          >
            {plants.data.map((plant) => {
              const species = catalog.get(plant.speciesId);
              return (
                <PlantCard
                  key={plant.id}
                  plant={plant}
                  speciesName={catalog.commonName(plant.speciesId)}
                  scientificName={species?.scientificName}
                  speciesImage={species?.imageUrl}
                />
              );
            })}
            {!filtering && <AddPlantCard />}
          </section>
          {plants.data.length === 0 && filtering && (
            <div className="mt-3 rounded-[14px] border border-dashed border-[#d3dfd3] p-6 text-center text-xs text-[#788b7c]">
              <p>{t('collection.noMatches')}</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setParams({}, { replace: true });
                }}
                className="mt-3 min-h-9 rounded-full border border-line bg-white px-4 font-bold text-forest"
              >
                {t('collection.clearFilters')}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
