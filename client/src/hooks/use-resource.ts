import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ApiError, errorMessage, request } from '@/lib/api';
import { cacheVersion, readCache, removeCache, writeCache } from '@/lib/storage';
import type { Response } from '@/lib/types';
import { useApp } from '@/providers/app-provider';

export function useResource<T>(path: string | null) {
  const { session, offline, revision } = useApp();
  const userId = session?.user.id;
  const identity = `${userId}:${path}`;
  const enabled = !!userId && !!path;
  const [state, setState] = useState<{ identity: string; response: Response<T> | null; loading: boolean; error: string; saved: boolean }>({ identity, response: null, loading: enabled, error: '', saved: false });
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    if (!userId || !path) return;
    // A mutation revision also gives this focused resource a new reload identity.
    void revision;
    const run = ++sequence.current;
    const epoch = cacheVersion();
    setState(previous => ({ identity, response: previous.identity === identity ? previous.response : null, loading: true, error: '', saved: previous.identity === identity && previous.saved }));
    const cached = await readCache<Response<T>>(userId, path);
    if (sequence.current !== run) return;
    if (cached) setState(previous => ({ ...previous, response: previous.response ?? cached, saved: previous.response ? previous.saved : true }));
    if (offline) { setState(previous => ({ ...previous, loading: false, saved: !!previous.response, error: previous.response ? '' : "You're offline. No saved data is available yet." })); return; }
    try {
      const response = await request<T>(path);
      if (sequence.current !== run) return;
      setState({ identity, response, loading: false, error: '', saved: false });
      await writeCache(userId, path, response, epoch);
    } catch (error) {
      if (sequence.current !== run || (error instanceof ApiError && error.code === 'SESSION_CHANGED')) return;
      // Definitive denials/deletions must not keep showing the cached record.
      if (error instanceof ApiError && [403, 404, 410].includes(error.status)) { setState({ identity, response: null, loading: false, error: errorMessage(error), saved: false }); await removeCache(userId, path); return; }
      setState(previous => ({ ...previous, loading: false, error: errorMessage(error), saved: !!previous.response }));
    }
  }, [userId, path, offline, identity, revision]);
  useFocusEffect(useCallback(() => { void reload(); return () => { sequence.current++; }; }, [reload]));
  useEffect(() => () => { sequence.current++; }, []);
  const visible = enabled && state.identity === identity ? state : { response: null, loading: enabled, error: '', saved: false };
  return { ...visible, data: visible.response?.data, pagination: visible.response?.pagination, reload };
}
