import { uuid } from 'expo';
import { useRef, useState } from 'react';
import { ApiError, request } from '@/lib/api';
import { cacheVersion, readIntent, removeIntent, writeIntent } from '@/lib/storage';
import { useApp } from '@/providers/app-provider';
export function useMutation() {
  const { session, offline, invalidate } = useApp(); const userId = session?.user.id; const [busy, setBusy] = useState(false); const lock = useRef(false);
  const intent = useRef<{ userId?: string; payload: string; key: string } | null>(null);
  const mutate = async <T,>(path: string, method: string, body?: unknown, idempotent = false) => {
    if (lock.current) throw new Error('A save is already in progress.');
    if (offline) throw new Error("You're offline. Changes are disabled.");
    const payload = JSON.stringify({ path, method, body });
    if (intent.current && intent.current.userId !== userId) intent.current = null;
    if (idempotent && intent.current && intent.current.payload !== payload) throw new Error('The previous save may have succeeded. Retry with unchanged details, or check the group before starting another record.');
    lock.current = true; setBusy(true);
    const release = async () => { intent.current = null; if (idempotent && userId) await removeIntent(userId, payload); };
    try {
      if (idempotent && !intent.current) {
        // Persist before sending: a lost response must reuse this key even after a restart.
        const epoch = cacheVersion(); const saved = userId ? await readIntent(userId, payload) : null;
        // Expo core provides native UUIDs without the separate ExpoCrypto module.
        intent.current = { userId, payload, key: saved ?? uuid.v4() };
        if (userId && !saved) await writeIntent(userId, payload, intent.current.key, epoch);
      }
      const result = await request<T>(path, { method, body, ...(idempotent ? { key: intent.current!.key } : {}) }); await release(); invalidate(); return result;
    }
    catch (error) { if (error instanceof ApiError && error.status >= 400 && error.status < 500) await release(); throw error; }
    finally { lock.current = false; setBusy(false); }
  };
  return { busy, mutate };
}
