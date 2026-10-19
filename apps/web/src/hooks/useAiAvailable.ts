import { api } from '../api';
import { useAsync } from './useAsync';

/**
 * Whether AI actions can be offered: a key is configured, the owner's switch is
 * on and the monthly limit isn't reached. False while loading or on errors, so
 * AI buttons stay hidden unless the server says they work.
 */
export function useAiAvailable(): boolean {
  const config = useAsync(() => api.getConfig(), []);
  return config.data?.ai.available ?? false;
}
