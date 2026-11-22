import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ApiError, errorMessage, request } from '@/lib/api';
import { cacheVersion, readCache, writeCache } from '@/lib/storage';
import type { Response } from '@/lib/types';
import { useApp } from '@/providers/app-provider';

// Loads several paths together (e.g. one per group). Each result falls back to its saved copy.
export function useResources<T>(paths: string[]) {
  const { session, offline, revision } = useApp();
  const userId = session?.user.id; const key = paths.join('|');
  const [state, setState] = useState<{ key: string; data: (Response<T> | null)[]; loading: boolean; error: string }>({ key, data: [], loading: true, error: '' });
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    if (!userId) return;
    void revision;
    const run = ++sequence.current; const epoch = cacheVersion(); const list = key ? key.split('|') : [];
    setState(previous => ({ key, data: previous.key === key ? previous.data : [], loading: true, error: '' }));
    const results = await Promise.all(list.map(async path => {
      const cached = await readCache<Response<T>>(userId, path);
      if (offline) return { value: cached, error: cached ? '' : "You're offline. No saved data is available yet." };
      try { const value = await request<T>(path); await writeCache(userId, path, value, epoch); return { value, error: '' }; }
      catch (error) { return { value: cached, error: error instanceof ApiError && error.code === 'SESSION_CHANGED' ? '' : errorMessage(error) }; }
    }));
    if (sequence.current !== run) return;
    setState({ key, data: results.map(result => result.value), loading: false, error: results.find(result => result.error)?.error ?? '' });
  }, [userId, key, offline, revision]);
  useFocusEffect(useCallback(() => { void reload(); return () => { sequence.current++; }; }, [reload]));
  useEffect(() => () => { sequence.current++; }, []);
  const visible = state.key === key ? state : { data: [], loading: true, error: '' };
  return { ...visible, reload };
}
