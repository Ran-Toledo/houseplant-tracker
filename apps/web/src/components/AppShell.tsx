import { useCallback, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';
import { useCareChanged } from '../lib/care';
import { Icon, type IconName } from './Icon';

interface NavItem {
  to: string;
  icon: IconName;
  label: string;
  end?: boolean;
}

const PLANTS: NavItem = { to: '/', icon: 'home', label: 'nav.plants', end: true };
const SPECIES: NavItem = { to: '/species', icon: 'book', label: 'nav.species' };
const ASSISTANT: NavItem = { to: '/assistant', icon: 'sparkle', label: 'nav.assistant' };
const SETTINGS: NavItem = { to: '/settings', icon: 'settings', label: 'nav.settings' };

/** The Assistant tab shows when AI can be used, or when there are past conversations to read. */
function useShowAssistant(): boolean {
  const state = useAsync(
    () =>
      api
        .getConfig()
        .then((c) => c.ai.available || api.listConversations().then((list) => list.length > 0))
        .catch(() => false),
    [],
  );
  return state.data ?? false;
}

/** Plants whose soil check is overdue or due today, refreshed on navigation and after care changes. */
function useDueNowCount(): number {
  const location = useLocation();
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  useCareChanged(bump);
  const due = useAsync(() => api.listDue(0), [location.pathname, version]);
  return due.data?.length ?? 0;
}

/** Bell at the end of the My plants header; opens the Notifications page and shows how many plants are due. */
function NotificationsBell() {
  const { t } = useTranslation();
  const dueNow = useDueNowCount();
  return (
    <Link
      to="/notifications"
      className="relative ms-auto grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-white text-forest hover:bg-sage"
    >
      <Icon name="bell" className="size-[22px]" />
      {dueNow > 0 && (
        <span
          aria-hidden="true"
          className="absolute -end-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-clay px-1 text-[10px] leading-[18px] font-extrabold text-white"
        >
          {dueNow}
        </span>
      )}
      {/* Heard as "Notifications, 2 plants need care" rather than a bare number. */}
      <span className="sr-only">
        {t('notifications.title')}
        {dueNow > 0 && `, ${t('reminders.navBadge', { count: dueNow })}`}
      </span>
    </Link>
  );
}

/**
 * Page frame from the mockups: a full-bleed panel on phones, a centered
 * rounded "stage" on larger screens, with a sticky bottom navigation bar.
 */
export function AppShell() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const nav = useShowAssistant() ? [PLANTS, SPECIES, ASSISTANT, SETTINGS] : [PLANTS, SPECIES, SETTINGS];
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
          {pathname === '/' && <NotificationsBell />}
        </header>
        <Outlet />
      </main>

      <nav
        aria-label={t('nav.label')}
        className="sticky bottom-0 z-10 flex items-center justify-around gap-2 border-t border-line bg-white/90 px-4 pt-[11px] pb-[max(13px,env(safe-area-inset-bottom))] backdrop-blur-md min-[600px]:rounded-b-[30px]"
      >
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex min-w-[64px] flex-col items-center gap-1 px-1.5 py-[3px] text-[13px] font-extrabold ${
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
