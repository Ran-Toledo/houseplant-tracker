import { describe, expect, it } from 'vitest';
import i18n, { changeLanguage, detectLanguage, STORAGE_KEY } from '.';
import en from './en.json';
import he from './he.json';

/** Flattens nested keys, ignoring plural suffixes so `_two` (Hebrew-only) doesn't count as missing. */
function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj)
    .flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k.replace(/_(one|two|other)$/, '')}`]))
    .filter((k, i, all) => all.indexOf(k) === i)
    .sort();
}

describe('translations', () => {
  it('English and Hebrew define the same keys', () => {
    expect(keys(he)).toEqual(keys(en));
  });

  it('switches language, document direction and persists the choice', async () => {
    await changeLanguage('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('he');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('he');
    expect(i18n.t('collection.count', { count: 1 })).toBe('צמח אחד');

    await changeLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(i18n.t('collection.count', { count: 3 })).toBe('3 plants');
  });

  it('prefers the stored language, then falls back to English', () => {
    localStorage.setItem(STORAGE_KEY, 'he');
    expect(detectLanguage()).toBe('he');
    localStorage.removeItem(STORAGE_KEY);
    // jsdom reports en-US.
    expect(detectLanguage()).toBe('en');
  });
});
