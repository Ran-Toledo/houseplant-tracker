import type { TFunction } from 'i18next';
import { ApiRequestError } from '../api';

const TRANSLATED_CODES = [
  'network',
  'not_found',
  'validation_error',
  'unknown_species',
  'unsupported_image_format',
  'payload_too_large',
] as const;

/** A localized, user-facing message for any error thrown by the API layer. */
export function errorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiRequestError && (TRANSLATED_CODES as readonly string[]).includes(error.code)) {
    return t(`errors.${error.code}`);
  }
  return t('errors.generic');
}

export const isNotFound = (error: unknown) => error instanceof ApiRequestError && error.status === 404;
