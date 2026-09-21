import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { setAuthToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, authenticated: false });

  const refresh = useCallback(async () => {
    try {
      const result = await api.me();
      setState({ loading: false, authenticated: Boolean(result.authenticated) });
      return result.authenticated;
    } catch {
      setState({ loading: false, authenticated: false });
      return false;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (password) => {
    const result = await api.login(password);
    setAuthToken(result.token);
    setState({ loading: false, authenticated: true });
    return result;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* la suppression locale suffit */
    }
    setAuthToken(null);
    setState({ loading: false, authenticated: false });
  }, []);

  const value = useMemo(
    () => ({ ...state, login, logout, refresh, markAuthenticated: () => setState((s) => ({ ...s, authenticated: true })) }),
    [state, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return context;
}
