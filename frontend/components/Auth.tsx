'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, tokenStore } from '@/lib/api';
import type { User } from '@/lib/types';
import { ToastProvider } from './ui';

interface AuthState {
  user: User | null;
  unread: number;
  refreshUnread: () => void;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}
const Ctx = createContext<AuthState>({ user: null, unread: 0, refreshUnread: () => {}, signIn: async () => {}, signOut: () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [unread, setUnread] = useState(0);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const path = usePathname();

  const load = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null);
      setReady(true);
      return;
    }
    try {
      const r = await api<{ user: User; unread: number }>('/api/auth/me');
      setUser(r.user);
      setUnread(r.unread);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!ready) return;
    if (!user && path !== '/login') router.replace('/login');
    if (user && path === '/login') router.replace('/');
  }, [ready, user, path, router]);

  const signIn = useCallback(async (username: string, password: string) => {
    const r = await api<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body: { username, password } });
    tokenStore.set(r.token);
    setUser(r.user);
    const me = await api<{ unread: number }>('/api/auth/me').catch(() => ({ unread: 0 }));
    setUnread(me.unread);
  }, []);

  const signOut = useCallback(() => {
    tokenStore.clear();
    try {
      sessionStorage.removeItem('callsheet.alerts.seen');
    } catch {
      /* ignore */
    }
    setUser(null);
    router.replace('/login');
  }, [router]);

  const refreshUnread = useCallback(() => {
    api<{ unread: number }>('/api/auth/me')
      .then((r) => setUnread(r.unread))
      .catch(() => {});
  }, []);

  if (!ready) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <div className="spin" role="status" aria-label="Loading" />
      </div>
    );
  }
  if (!user && path !== '/login') return null;

  return (
    <Ctx.Provider value={{ user, unread, refreshUnread, signIn, signOut }}>
      <ToastProvider>{children}</ToastProvider>
    </Ctx.Provider>
  );
}
