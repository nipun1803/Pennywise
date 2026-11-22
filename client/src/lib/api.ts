import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { Response } from './types';

function resolveApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  // Physical devices cannot reach "localhost" (the phone itself) or the
  // Android emulator's 10.0.2.2 alias. When running through Expo, derive the
  // dev machine's LAN IP from the Metro host so the phone talks to the same
  // machine that serves the bundle.
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as unknown as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:3000`;
    }
  }
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}

export const API_URL = resolveApiUrl().replace(/\/$/, '');
export class ApiError extends Error {
  constructor(message: string, public status = 0, public code = 'NETWORK_ERROR') { super(message); }
}
let token: string | null = null;
let expire: (() => void) | undefined;
const pending = new Set<AbortController>();
export function configureSession(value: string | null, onExpired?: () => void) {
  if (value !== token) { for (const controller of pending) controller.abort(); pending.clear(); }
  token = value; expire = onExpired;
}
export async function request<T>(path: string, options: { method?: string; body?: unknown; public?: boolean; key?: string } = {}): Promise<Response<T>> {
  const activeToken = options.public ? null : token;
  const controller = new AbortController();
  pending.add(controller);
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET', signal: controller.signal,
      headers: { ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}), ...(options.key ? { 'Idempotency-Key': options.key } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    if (!options.public && activeToken !== token) throw new ApiError('Session changed.', 0, 'SESSION_CHANGED');
    // Expire even if a proxy returns an empty/non-JSON 401 response.
    if (response.status === 401 && !options.public) expire?.();
    if (response.status === 204) return { data: undefined as T };
    const json = await response.json();
    if (!options.public && activeToken !== token) throw new ApiError('Session changed.', 0, 'SESSION_CHANGED');
    if (!response.ok) {
      throw new ApiError(json.error?.message || 'The request could not be completed.', response.status, json.error?.code || 'SERVER_ERROR');
    }
    return json as Response<T>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (!options.public && activeToken !== token) throw new ApiError('Session changed.', 0, 'SESSION_CHANGED');
    throw new ApiError('Could not reach Pennywise. Check your connection and try again.');
  } finally { clearTimeout(timeout); pending.delete(controller); }
}
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
