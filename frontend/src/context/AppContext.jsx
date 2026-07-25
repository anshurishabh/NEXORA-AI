import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '../api.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [providers, setProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [analytics, setAnalytics] = useState({ tasksRun: 0, agentUsage: {}, activity: [], conversationCount: 0 });
  const [backendError, setBackendError] = useState(null);

  const refreshProviders = useCallback(async () => {
    try {
      const data = await api.getProviders();
      setProviders(data.providers);
      setBackendError(null);
    } catch (err) {
      setBackendError(err.message);
    } finally {
      setLoadingProviders(false);
    }
  }, []);

  const refreshAnalytics = useCallback(async () => {
    try {
      const data = await api.getAnalytics();
      setAnalytics(data);
      setBackendError(null);
    } catch (err) {
      setBackendError(err.message);
    }
  }, []);

  useEffect(() => {
    refreshProviders();
    refreshAnalytics();
  }, [refreshProviders, refreshAnalytics]);

  const value = {
    providers,
    loadingProviders,
    refreshProviders,
    analytics,
    refreshAnalytics,
    backendError
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
