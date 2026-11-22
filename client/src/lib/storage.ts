import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Session } from './types';

const SESSION_KEY = 'pennywise.session.v1';
const CACHE_PREFIX = 'pennywise.cache.v1.';
const INTENT_PREFIX = 'pennywise.intent.v1.';
// Server keys never expire; a day bounds how long an unresolved save can be replayed.
const INTENT_TTL = 24 * 60 * 60 * 1000;
let memorySession: Session | null = null;
// Web deliberately keeps credentials in memory, not localStorage/AsyncStorage.
export async function readSession(): Promise<Session | null> {
  if (Platform.OS === 'web') return memorySession;
  const value = await SecureStore.getItemAsync(SESSION_KEY);
  return value ? JSON.parse(value) as Session : null;
}
let sessionWrites: Promise<void> = Promise.resolve();
export function writeSession(value: Session | null) {
  // FIFO prevents a late profile persistence call from resurrecting a logout.
  sessionWrites = sessionWrites.catch(() => undefined).then(async () => {
    if (Platform.OS === 'web') { memorySession = value; return; }
    if (value) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(value));
    else await SecureStore.deleteItemAsync(SESSION_KEY);
  });
  return sessionWrites;
}
const keyFor = (userId: string, path: string) => `${CACHE_PREFIX}${userId}.${encodeURIComponent(path)}`;
const intentFor = (userId: string, payload: string) => `${INTENT_PREFIX}${userId}.${encodeURIComponent(payload)}`;
let cacheEpoch = 0;
export const cacheVersion = () => cacheEpoch;
let writes: Promise<unknown> = Promise.resolve();
function queue(task: () => Promise<void>, epoch = cacheEpoch) {
  writes = writes.catch(() => undefined).then(async () => { if (epoch === cacheEpoch) await task(); });
  return writes.catch(() => undefined);
}
export async function readCache<T>(userId: string, path: string): Promise<T | null> {
  try { const value = await AsyncStorage.getItem(keyFor(userId, path)); return value ? JSON.parse(value) as T : null; }
  catch { return null; }
}
export const writeCache = (userId: string, path: string, value: unknown, epoch = cacheEpoch) => queue(() => AsyncStorage.setItem(keyFor(userId, path), JSON.stringify(value)), epoch);
export const removeCache = (userId: string, path: string) => queue(() => AsyncStorage.removeItem(keyFor(userId, path)));
// Unresolved creation keys survive restarts so a lost response is retried, not duplicated.
export async function readIntent(userId: string, payload: string): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(intentFor(userId, payload)); const intent = value ? JSON.parse(value) as { key: string; at: number } : null;
    if (intent && Date.now() - intent.at < INTENT_TTL) return intent.key;
    if (intent) await removeIntent(userId, payload);
    return null;
  } catch { return null; }
}
export const writeIntent = (userId: string, payload: string, key: string, epoch = cacheEpoch) => queue(() => AsyncStorage.setItem(intentFor(userId, payload), JSON.stringify({ key, at: Date.now() })), epoch);
export const removeIntent = (userId: string, payload: string) => queue(() => AsyncStorage.removeItem(intentFor(userId, payload)));
export async function clearAccountCaches() {
  cacheEpoch++;
  await writes.catch(() => undefined);
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(CACHE_PREFIX) || key.startsWith(INTENT_PREFIX));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
