import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.jsx';
import { ProtectedRoute } from './ProtectedRoute.jsx';
import { ForgotPasswordPage, LoginPage, RegisterPage } from '../features/auth/AuthPages.jsx';
import { LoadingState } from '../components/ui/States.jsx';
import { repo } from '../services/repositories/index.js';

const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage.jsx').then((m) => ({ default: m.DashboardPage })));
const MyTasksPage = lazy(() => import('../features/tasks/MyTasksPage.jsx').then((m) => ({ default: m.MyTasksPage })));
const KanbanBoardPage = lazy(() => import('../features/kanban/KanbanBoardPage.jsx').then((m) => ({ default: m.KanbanBoardPage })));
const SprintsPage = lazy(() => import('../features/sprints/SprintsPage.jsx').then((m) => ({ default: m.SprintsPage })));
const SprintDetailPage = lazy(() => import('../features/sprints/SprintDetailPage.jsx').then((m) => ({ default: m.SprintDetailPage })));
const CalendarPage = lazy(() => import('../features/calendar/CalendarPage.jsx').then((m) => ({ default: m.CalendarPage })));
const FocusModePage = lazy(() => import('../features/focus/FocusModePage.jsx').then((m) => ({ default: m.FocusModePage })));
const AnalyticsPage = lazy(() => import('../features/analytics/AnalyticsPage.jsx').then((m) => ({ default: m.AnalyticsPage })));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage.jsx').then((m) => ({ default: m.SettingsPage })));

function PageSuspense({ children }) {
  return <Suspense fallback={<LoadingState label="Loading page..." rows={4} />}>{children}</Suspense>;
}

export function AppRouter() {
  const isLocalOnly = repo.mode === 'local';

  const workspaceRoot = isLocalOnly ? (
    <AppShell />
  ) : (
    <ProtectedRoute>
      <AppShell />
    </ProtectedRoute>
  );

  return (
    <BrowserRouter>
      <Routes>
        {!isLocalOnly && (
          <>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </>
        )}

        <Route path="/" element={workspaceRoot}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<PageSuspense><DashboardPage /></PageSuspense>} />
          <Route path="tasks" element={<PageSuspense><MyTasksPage /></PageSuspense>} />
          <Route path="board" element={<PageSuspense><KanbanBoardPage /></PageSuspense>} />
          <Route path="sprints" element={<PageSuspense><SprintsPage /></PageSuspense>} />
          <Route path="sprints/:id" element={<PageSuspense><SprintDetailPage /></PageSuspense>} />
          <Route path="calendar" element={<PageSuspense><CalendarPage /></PageSuspense>} />
          <Route path="focus" element={<PageSuspense><FocusModePage /></PageSuspense>} />
          <Route path="analytics" element={<PageSuspense><AnalyticsPage /></PageSuspense>} />
          <Route path="settings" element={<PageSuspense><SettingsPage /></PageSuspense>} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
