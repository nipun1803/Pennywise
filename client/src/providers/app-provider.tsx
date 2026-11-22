import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import { configureSession, request } from '@/lib/api';
import { tokenExpiry } from '@/lib/format';
import { clearAccountCaches, readSession, writeSession } from '@/lib/storage';
import type { Session, User } from '@/lib/types';
import { palette, type AppColors } from '@/theme/palette';

type ThemeMode = 'system' | 'light' | 'dark';
interface AppState {
  session: Session | null; loading: boolean; offline: boolean; colors: AppColors; dark: boolean;
  themeMode: ThemeMode; setThemeMode: (mode: ThemeMode) => void;
  authenticate: (signup: boolean, body: { name?: string; email: string; password: string }) => Promise<void>;
  updateUser: (user: User) => Promise<void>; logout: () => Promise<void>;
  revision: number; invalidate: () => void; message: string; notify: (message: string) => void;
  pendingCode: string; setPendingCode: (code: string) => void;
}
const AppContext = createContext<AppState | null>(null);
export function AppProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const current = useRef<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [themeMode, setMode] = useState<ThemeMode>('system');
  const [revision, setRevision] = useState(0);
  const [message, notify] = useState('');
  const [pendingCode, setPendingCode] = useState('');
  const systemTheme = useColorScheme();
  const dark = themeMode === 'dark' || (themeMode === 'system' && systemTheme === 'dark');
  const clearSession = useCallback(async (expired = false) => {
    current.current = null; configureSession(null); setSession(null); setPendingCode('');
    if (expired) notify('Please log in again.');
    await Promise.all([writeSession(null), clearAccountCaches()]);
  }, []);
  const install = useCallback((value: Session) => {
    current.current = value;
    configureSession(value.token, () => { void clearSession(true).catch(() => notify('Please log in again. Session storage could not be cleared.')); });
    setSession(value);
  }, [clearSession]);
  useEffect(() => {
    let active = true;
    const unsubscribe = NetInfo.addEventListener(state => setOffline(state.isConnected === false || state.isInternetReachable === false));
    void AsyncStorage.getItem('pennywise.theme').then(mode => { if (active && (mode === 'light' || mode === 'dark' || mode === 'system')) setMode(mode); }).catch(() => undefined);
    void (async () => {
      try {
        const saved = await readSession();
        if (!active) return;
        if (saved && saved.user?.id && saved.token) {
          if (tokenExpiry(saved.token) <= Date.now()) await clearSession(true);
          else install(saved);
        }
      } catch { await clearSession(true).catch(() => undefined); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; unsubscribe(); };
  }, [clearSession, install]);
  const updateUser = useCallback(async (user: User) => {
    const active = current.current;
    if (!active || active.user.id !== user.id) return;
    const next = { ...active, user };
    await writeSession(next);
    if (current.current?.token === active.token) install(next);
  }, [install]);
  const sessionToken = session?.token;
  const expiresAt = session?.expiresAt;
  useEffect(() => {
    if (!sessionToken || offline) return;
    const token = sessionToken;
    void request<User>('/me').then(result => { if (current.current?.token === token) return updateUser(result.data); }).catch(() => undefined);
  }, [sessionToken, offline, updateUser]);
  useEffect(() => {
    if (!expiresAt) return;
    const delay = Math.max(0, Math.min(expiresAt - Date.now(), 2147483647));
    const timer = setTimeout(() => { void clearSession(true).catch(() => undefined); }, delay);
    return () => clearTimeout(timer);
  }, [sessionToken, expiresAt, clearSession]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => notify(''), 6500);
    return () => clearTimeout(timer);
  }, [message]);
  const authenticate = async (signup: boolean, body: { name?: string; email: string; password: string }) => {
    if (offline) throw new Error("You're offline. Connect to sign in.");
    const result = await request<{ token: string; user: User }>(signup ? '/auth/signup' : '/auth/login', { method: 'POST', body, public: true });
    const next = { ...result.data, expiresAt: tokenExpiry(result.data.token) };
    await clearAccountCaches();
    await writeSession(next);
    install(next);
  };
  return <AppContext.Provider value={{ session, loading, offline, colors: palette[dark ? 'dark' : 'light'], dark, themeMode,
    setThemeMode: mode => { setMode(mode); void AsyncStorage.setItem('pennywise.theme', mode).catch(() => notify('Theme changed, but could not be saved.')); },
    authenticate, updateUser, logout: () => clearSession(), revision, invalidate: () => setRevision(value => value + 1), message, notify, pendingCode, setPendingCode }}>{children}</AppContext.Provider>;
}
export function useApp() { const state = useContext(AppContext); if (!state) throw new Error('AppProvider is missing'); return state; }
