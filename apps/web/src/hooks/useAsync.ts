import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  /** Re-runs the loader; previous data stays visible while it loads. */
  reload: () => void;
  /** Replaces the data locally, e.g. with the value a mutation returned. */
  setData: (data: T) => void;
}

/** Runs `load` whenever `deps` change, ignoring results from superseded runs. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const runId = useRef(0);

  useEffect(() => {
    const id = ++runId.current;
    setLoading(true);
    setError(undefined);
    load()
      .then((value) => {
        if (id === runId.current) setData(value);
      })
      .catch((err: unknown) => {
        if (id === runId.current) setError(err);
      })
      .finally(() => {
        if (id === runId.current) setLoading(false);
      });
    // `load` is intentionally not a dependency: callers pass what it depends on in `deps`.
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload, setData };
}
