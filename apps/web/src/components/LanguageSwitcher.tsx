import { useTranslation } from 'react-i18next';
import { changeLanguage, SUPPORTED_LANGUAGES } from '../i18n';

/** EN / עברית pill toggle from the design mockups. */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-[#e7ece3] bg-[#f0f2ec] p-[3px]"
    >
      {SUPPORTED_LANGUAGES.map((lang) => {
        const active = i18n.resolvedLanguage === lang;
        return (
          <button
            key={lang}
            type="button"
            lang={lang}
            aria-pressed={active}
            onClick={() => void changeLanguage(lang)}
            className={`min-h-8 rounded-full px-3 text-xs font-extrabold transition ${
              active ? 'bg-white text-forest shadow-[0_1px_5px_rgba(27,65,35,.13)]' : 'text-[#758378] hover:text-forest'
            }`}
          >
            {t(`language.short.${lang}`)}
          </button>
        );
      })}
    </div>
  );
}
