import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    api
      .get('/auth/me')
      .then((r) => setUser(r.data.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener('eventqr:unauthorized', out);
    return () => window.removeEventListener('eventqr:unauthorized', out);
  }, []);

  const finish = useCallback((data) => {
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login: async (email, password) => finish((await api.post('/auth/login', { email, password })).data),
      demoLogin: async () => finish((await api.post('/auth/demo-login')).data),
      logout: async () => {
        try { await api.post('/auth/logout'); } catch { /* stateless; ignore */ }
        setToken(null);
        setUser(null);
        try { localStorage.removeItem('eventqr_event'); } catch { /* ignore */ }
      },
    }),
    [user, loading, finish],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
