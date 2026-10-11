import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Language, SpeciesSummary } from '@houseplant/shared';
import { api } from '../api';
import { useAsync } from './useAsync';

// The catalog is static while the app runs, so fetch it once per page load.
let cached: Promise<SpeciesSummary[]> | undefined;
function loadSpecies() {
  cached ??= api.listSpecies().catch((err: unknown) => {
    cached = undefined; // Allow a retry after a failure.
    throw err;
  });
  return cached;
}

/** Species summaries sorted for the active language, plus name lookups. */
export function useSpeciesCatalog() {
  const { i18n } = useTranslation();
  const lang: Language = i18n.resolvedLanguage === 'he' ? 'he' : 'en';
  const state = useAsync(loadSpecies, []);

  return useMemo(() => {
    const list = state.data ?? [];
    const byId = new Map(list.map((s) => [s.id, s]));
    return {
      loading: state.loading,
      error: state.error,
      reload: state.reload,
      species: [...list].sort((a, b) => a.names[lang].commonName.localeCompare(b.names[lang].commonName, lang)),
      get: (id: string | null | undefined) => (id ? byId.get(id) : undefined),
      commonName: (id: string | null | undefined) => (id ? byId.get(id)?.names[lang].commonName : undefined),
    };
  }, [state.data, state.loading, state.error, state.reload, lang]);
}
