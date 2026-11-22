import { uuid } from 'expo';
import { useRef, useState } from 'react';
import { ApiError, request } from '@/lib/api';
import { useApp } from '@/providers/app-provider';
export function useMutation() {
  const { offline, invalidate } = useApp(); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const intent = useRef<{ payload: string; key: string } | null>(null);
  const mutate = async <T,>(path: string, method: string, body?: unknown, idempotent = false) => {
    if (lock.current) throw new Error('A save is already in progress.');
    if (offline) throw new Error("You're offline. Changes are disabled.");
    if (idempotent) {
      const payload = JSON.stringify({ path, method, body });
      if (intent.current && intent.current.payload !== payload) throw new Error('The previous save may have succeeded. Retry with unchanged details, or check the group before starting another record.');
      // Expo core provides native UUIDs without the separate ExpoCrypto module.
      intent.current ??= { payload, key: uuid.v4() };
    }
    lock.current = true; setBusy(true);
    try { const result = await request<T>(path, { method, body, ...(idempotent ? { key: intent.current!.key } : {}) }); intent.current = null; invalidate(); return result; }
    catch (error) { if (error instanceof ApiError && error.status >= 400 && error.status < 500) intent.current = null; throw error; }
    finally { lock.current = false; setBusy(false); }
  };
  return { busy, mutate };
}
