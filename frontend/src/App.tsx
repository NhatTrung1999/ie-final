import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { NotFoundScreen } from '@/components/common/not-found-screen';
import { ToastViewport } from '@/components/common/toast';
import { SyncBridge } from '@/components/common/sync-bridge';
import { TooltipProvider } from '@/components/ui/tooltip';
import { UNAUTHORIZED_EVENT } from '@/lib/api-client';
import { getStoredTheme, getStoredToken, persistTheme, type ThemeMode } from '@/lib/storage';
import { DashboardPage } from '@/pages/dashboard-page';
import { LoginPage } from '@/pages/login-page';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  bootstrapSession,
  signIn,
  signOut,
} from '@/store/slices/auth-slice';

function App() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());
  const { isAuthenticated, isBootstrapping, sessionUser } = useAppSelector(
    (state) => state.auth,
  );
  const hasStoredSession = Boolean(getStoredToken());
  const canUseSession = isAuthenticated || hasStoredSession;

  useEffect(() => {
    void dispatch(bootstrapSession());
  }, [dispatch]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    persistTheme(theme);
  }, [theme]);

  useEffect(() => {
    const handleUnauthorized = () => {
      dispatch(signOut());
      navigate('/login', { replace: true });
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [dispatch, navigate]);

  const handleSignIn = async (payload: {
    username: string;
    password: string;
    category: string;
  }) => {
    const result = await dispatch(signIn(payload));

    if (signIn.fulfilled.match(result)) {
      navigate('/dashboard', { replace: true });
      return;
    }

    throw new Error(
      typeof result.payload === 'string'
        ? result.payload
        : 'Unable to sign in right now.',
    );
  };

  const handleSignOut = () => {
    dispatch(signOut());
    navigate('/login', { replace: true });
  };

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        Checking session...
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={400}>
      <ToastViewport />
      <SyncBridge enabled={canUseSession} />
      <Routes>
        <Route
          path="/login"
          element={
            canUseSession ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LoginPage onSignIn={handleSignIn} />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute isAuthenticated={canUseSession}>
              <DashboardPage
                displayName={sessionUser.username}
                subtitle={sessionUser.category}
                role={sessionUser.role}
                theme={theme}
                onToggleTheme={() =>
                  setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
                }
                onSignOut={handleSignOut}
              />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={<Navigate to={canUseSession ? '/dashboard' : '/login'} replace />}
        />
        <Route path="*" element={<NotFoundScreen isAuthenticated={isAuthenticated} />} />
      </Routes>
    </TooltipProvider>
  );
}

export default App;
