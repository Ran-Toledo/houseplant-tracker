import { NavLink, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from './Icon';

const NAV: { to: string; icon: IconName; label: string; end?: boolean }[] = [
  { to: '/', icon: 'home', label: 'nav.plants', end: true },
  { to: '/species', icon: 'book', label: 'nav.species' },
  { to: '/settings', icon: 'settings', label: 'nav.settings' },
];

/**
 * Page frame from the mockups: a full-bleed panel on phones, a centered
 * rounded "stage" on larger screens, with a sticky bottom navigation bar.
 */
export function AppShell() {
  const { t } = useTranslation();
  return (
    <div className="relative flex min-h-dvh flex-col bg-panel min-[600px]:mx-auto min-[600px]:my-8 min-[600px]:min-h-[825px] min-[600px]:max-w-[720px] min-[600px]:rounded-[30px] min-[600px]:border min-[600px]:border-[rgba(132,159,132,.25)] min-[600px]:shadow-stage">
      <main className="flex-1 px-[19px] pt-[max(22px,env(safe-area-inset-top))] pb-7 min-[600px]:px-[25px] min-[600px]:pt-[30px] max-[390px]:px-4">
        <header className="mb-[25px] flex items-center gap-4 min-[600px]:mb-[29px]">
          <NavLink to="/" className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-[35px] shrink-0 place-items-center rounded-xl bg-forest text-white">
              <Icon name="leaf" className="size-[23px]" />
            </span>
            <span className="truncate text-[17px] font-extrabold tracking-tight">{t('app.title')}</span>
          </NavLink>
        </header>
        <Outlet />
      </main>

      <nav
        aria-label={t('nav.label')}
        className="sticky bottom-0 z-10 flex items-center justify-around gap-2 border-t border-line bg-white/90 px-4 pt-[11px] pb-[max(13px,env(safe-area-inset-bottom))] backdrop-blur-md min-[600px]:rounded-b-[30px]"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex min-w-[72px] flex-col items-center gap-1 px-1.5 py-[3px] text-[13px] font-extrabold ${
                isActive ? 'text-forest-2' : 'text-[#89978c] hover:text-forest-2'
              }`
            }
          >
            <Icon name={item.icon} className="size-6" />
            <span>{t(item.label)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
