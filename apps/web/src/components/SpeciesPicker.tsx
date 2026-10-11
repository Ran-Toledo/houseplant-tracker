import { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Language, SpeciesSummary } from '@houseplant/shared';
import { Icon } from './Icon';

/** Sentinel value meaning "the species isn't in the catalog". */
export const NOT_IN_CATALOG = '__custom__';

interface SpeciesPickerProps {
  species: SpeciesSummary[];
  /** A species id, `NOT_IN_CATALOG`, or `''` for no selection. */
  value: string;
  onChange: (value: string) => void;
  labelledBy: string;
}

function matches(s: SpeciesSummary, needle: string) {
  const names = [s.scientificName, ...Object.values(s.names).flatMap((n) => [n.commonName, ...n.alternateNames])];
  return names.some((n) => n.toLocaleLowerCase().includes(needle));
}

/**
 * Searchable species list: localized common name first, scientific name as
 * secondary text. Matches names in either language.
 */
export function SpeciesPicker({ species, value, onChange, labelledBy }: SpeciesPickerProps) {
  const { t, i18n } = useTranslation();
  const lang: Language = i18n.resolvedLanguage === 'he' ? 'he' : 'en';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = species.find((s) => s.id === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? species.filter((s) => matches(s, needle)) : species;
  }, [species, query]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    setQuery('');
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelledBy}
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => searchRef.current?.focus(), 0);
        }}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 text-start"
      >
        <span className="min-w-0">
          {selected ? (
            <>
              <span className="block truncate font-bold">{selected.names[lang].commonName}</span>
              <i className="block truncate text-xs text-subtle">
                <bdi>{selected.scientificName}</bdi>
              </i>
            </>
          ) : value === NOT_IN_CATALOG ? (
            <span className="font-bold">{t('speciesPicker.none')}</span>
          ) : (
            <span className="text-subtle">{t('speciesPicker.placeholder')}</span>
          )}
        </span>
        <Icon name="chevron" className={`size-4 text-muted transition ${open ? 'rotate-90' : ''}`} flipRtl={!open} />
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-line bg-white p-2 shadow-card">
          <label className="mb-2 flex items-center gap-2 rounded-lg bg-[#f5f7f2] px-2.5 text-[#829387]">
            <Icon name="search" className="size-4" />
            <span className="sr-only">{t('speciesPicker.search')}</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('speciesPicker.search')}
              autoComplete="off"
              className="min-h-10 w-full min-w-0 bg-transparent text-ink outline-none"
            />
          </label>
          <ul id={listId} role="listbox" aria-label={t('speciesPicker.listLabel')} className="max-h-72 overflow-y-auto">
            {filtered.map((s) => (
              <li key={s.id} role="option" aria-selected={s.id === value}>
                <button
                  type="button"
                  onClick={() => choose(s.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start hover:bg-sage ${s.id === value ? 'bg-mint' : ''}`}
                >
                  {s.imageUrl && (
                    <img src={s.imageUrl} alt="" className="size-10 shrink-0 rounded-lg bg-sage object-cover" />
                  )}
                  <span className="min-w-0">
                    <span className="block font-bold">{s.names[lang].commonName}</span>
                    <i className="block text-xs text-subtle">
                      <bdi>{s.scientificName}</bdi>
                    </i>
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-2.5 py-2 text-sm text-muted">{t('speciesPicker.noResults')}</li>}
            <li role="option" aria-selected={value === NOT_IN_CATALOG} className="mt-1 border-t border-line-soft pt-1">
              <button
                type="button"
                onClick={() => choose(NOT_IN_CATALOG)}
                className="w-full rounded-lg px-2.5 py-2 text-start hover:bg-sage"
              >
                <span className="block font-bold">{t('speciesPicker.none')}</span>
                <span className="block text-xs text-subtle">{t('speciesPicker.noneHint')}</span>
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
