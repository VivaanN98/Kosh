import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { BackendProvider } from '@/data/BackendProvider';
import { MotionProvider } from '@/motion/MotionProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { AppShell } from '@/components/layout/AppShell';
import { RouteSkeleton } from '@/components/layout/RouteSkeleton';
import { AddSheetProvider } from '@/features/add/AddSheetContext';
import { StoreGate } from './StoreGate';

const HomePage = lazy(() => import('@/features/home/HomePage'));
const ActivityPage = lazy(() => import('@/features/activity/ActivityPage'));
const InsightsPage = lazy(() => import('@/features/insights/InsightsPage'));
const AccountsPage = lazy(() => import('@/features/accounts/AccountsPage'));
const AccountDetailPage = lazy(() => import('@/features/accounts/AccountDetailPage'));
const PlansPage = lazy(() => import('@/features/plans/PlansPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const NotFound = lazy(() => import('./NotFound'));

export function App() {
  return (
    <MotionProvider>
      <ToastProvider>
        <BrowserRouter>
          <BackendProvider fallback={<BootScreen />}>
            <StoreGate>
              <AddSheetProvider>
                <Routes>
                  <Route element={<AppShell />}>
                    <Route index element={<HomePage />} />
                    <Route path="activity" element={<ActivityPage />} />
                    <Route path="insights" element={<InsightsPage />} />
                    <Route path="accounts" element={<AccountsPage />} />
                    <Route path="accounts/:id" element={<AccountDetailPage />} />
                    <Route path="plans" element={<PlansPage />} />
                    <Route path="plans/:tab" element={<PlansPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    {/* The comparison lab was retired: card style now lives in Settings. */}
                    <Route path="design-lab/cards" element={<Navigate to="/settings#card-style" replace />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </AddSheetProvider>
            </StoreGate>
          </BackendProvider>
        </BrowserRouter>
      </ToastProvider>
    </MotionProvider>
  );
}

function BootScreen() {
  return (
    <div className="min-h-dvh md:pl-[var(--sidebar-w)]">
      <RouteSkeleton />
    </div>
  );
}
