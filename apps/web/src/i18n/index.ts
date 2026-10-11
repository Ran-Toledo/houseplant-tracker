import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Language } from '@houseplant/shared';
import en from './en.json';
import he from './he.json';

export const STORAGE_KEY = 'houseplant-language';
export const SUPPORTED_LANGUAGES: readonly Language[] = ['en', 'he'];

function readStoredLanguage(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'en' || value === 'he' ? value : null;
  } catch {
    return null; // Storage can be unavailable (e.g. private mode).
  }
}

/** Saved choice first, then the browser language, then English. */
export function detectLanguage(): Language {
  const stored = readStoredLanguage();
  if (stored) return stored;
  const browser = typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  return browser.some((l) => /^(he|iw)\b/i.test(l ?? '')) ? 'he' : 'en';
}

export const directionOf = (lang: Language) => (lang === 'he' ? 'rtl' : 'ltr');

/** The active UI language, narrowed to the supported set. */
export const currentLanguage = (): Language => (i18n.resolvedLanguage === 'he' ? 'he' : 'en');

function applyToDocument(lang: Language) {
  document.documentElement.lang = lang;
  document.documentElement.dir = directionOf(lang);
  document.title = i18n.t('app.title', { lng: lang });
}

export function changeLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Ignore: the choice just won't persist.
  }
  return i18n.changeLanguage(lang);
}

i18n.on('languageChanged', (lng) => applyToDocument(lng === 'he' ? 'he' : 'en'));

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, he: { translation: he } },
  lng: detectLanguage(),
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: { escapeValue: false }, // React already escapes output.
});
applyToDocument(currentLanguage());

export default i18n;
