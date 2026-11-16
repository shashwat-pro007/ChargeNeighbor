import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState(null);
  const [session, setSession] = useState({
    loading: true,
    user: null,
    hostProfile: null,
    listingCounts: {},
  });
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const loadMeta = useCallback(async () => {
    setMetaError(null);
    try {
      const data = await api.get('/meta');
      setMeta(data);
    } catch (error) {
      setMetaError(error);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setSession({
        loading: false,
        user: data.user,
        hostProfile: data.hostProfile ?? null,
        listingCounts: data.listingCounts ?? {},
      });
      return data.user;
    } catch (error) {
      setSession({ loading: false, user: null, hostProfile: null, listingCounts: {} });
      return null;
    }
  }, []);

  useEffect(() => {
    loadMeta();
    refreshSession();
  }, [loadMeta, refreshSession]);

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message, tone = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((current) => [...current, { id, message, tone }]);
      const timer = setTimeout(() => dismissToast(id), 5200);
      timers.current.set(id, timer);
      return id;
    },
    [dismissToast],
  );

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // even if the request fails, drop the local session
    }
    setSession({ loading: false, user: null, hostProfile: null, listingCounts: {} });
  }, []);

  const value = useMemo(
    () => ({
      meta,
      metaError,
      reloadMeta: loadMeta,
      session,
      setSession,
      refreshSession,
      signOut,
      toast,
      toasts,
      dismissToast,
      isSignedIn: Boolean(session.user),
      roles: session.user?.roles ?? [],
      isHost: Boolean(session.user?.roles?.includes('host')),
      isAdmin: Boolean(session.user?.roles?.includes('admin')),
    }),
    [meta, metaError, loadMeta, session, refreshSession, signOut, toast, toasts, dismissToast],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside <AppProvider>');
  return context;
}

/** Small helper so pages can show a friendly inline message for any error. */
export const describeError = (error) =>
  error instanceof ApiError ? error.message : error?.message || 'Something went wrong.';
