import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router';
import { AppShell } from './components/AppShell';
import { ToastProvider } from './components/Toast';
import { LoadingState } from './components/StatusViews';
import { NotFoundPage } from './pages/NotFoundPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { PlantDetailPage } from './pages/PlantDetailPage';
import { PlantFormPage } from './pages/PlantFormPage';
import { PlantListPage } from './pages/PlantListPage';
import { SettingsPage } from './pages/SettingsPage';
import { SpeciesDetailPage, SpeciesListPage } from './pages/SpeciesPages';

// The assistant pages bring the Markdown renderer, so they load only when opened.
const AssistantPage = lazy(() => import('./pages/AssistantPage').then((m) => ({ default: m.AssistantPage })));
const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })));

/** Start each new page at the top, as a phone user expects. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<PlantListPage />} />
        <Route path="plants/new" element={<PlantFormPage />} />
        <Route path="plants/:id" element={<PlantDetailPage />} />
        <Route path="plants/:id/edit" element={<PlantFormPage />} />
        <Route path="species" element={<SpeciesListPage />} />
        <Route path="species/:id" element={<SpeciesDetailPage />} />
        <Route
          path="assistant"
          element={
            <Suspense fallback={<LoadingState />}>
              <AssistantPage />
            </Suspense>
          }
        />
        <Route
          path="assistant/:id"
          element={
            <Suspense fallback={<LoadingState />}>
              <ChatPage />
            </Suspense>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ScrollToTop />
        <AppRoutes />
      </ToastProvider>
    </BrowserRouter>
  );
}
