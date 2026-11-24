import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import { getSessionToken, request } from './api';

// Show pushes as banners while the app is open; the screens refresh themselves.
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

let registered: string | null = null;
const TOKEN_KEY = 'pennywise.push-token';
export interface PushStatus { state: 'idle' | 'registering' | 'registered' | 'blocked' | 'unsupported' | 'error'; message: string }
const idle: PushStatus = { state: 'idle', message: 'Notification registration has not been checked yet.' };
let status = idle;
const listeners = new Set<() => void>();
export const getPushStatus = () => status;
export function subscribePushStatus(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function report(next: PushStatus) { status = next; for (const listener of listeners) listener(); }
let generation = 0;
let pending: Promise<string | null> | null = null;
export function cancelPushRegistration() { generation++; pending = null; report(idle); }
export function notificationRoute(data: unknown) {
  const groupId = data && typeof data === 'object' ? (data as { groupId?: unknown }).groupId : undefined;
  return typeof groupId === 'string' && /^[a-f\d]{24}$/i.test(groupId) ? { pathname: '/group/[id]', params: { id: groupId } } as const : null;
}
// Deduplicate simultaneous attempts and never register a token for a session that
// changed while the native permission/token calls were in flight.
export function registerForPush({ requestPermission = true } = {}): Promise<string | null> {
  if (pending) return pending;
  const version = generation; const session = getSessionToken();
  const active = () => version === generation && session === getSessionToken();
  const job = (async () => {
    if (Platform.OS !== 'android' || !Device.isDevice) {
      report({ state: 'unsupported', message: 'Push is currently supported on physical Android devices only.' }); return null;
    }
    if (Constants.appOwnership === 'expo') {
      report({ state: 'unsupported', message: 'Remote push needs an installed Pennywise build, not Expo Go.' }); return null;
    }
    report({ state: 'registering', message: 'Checking notification permission and registering this device…' });
    try {
      // Android 13+ only shows the permission prompt once a channel exists.
      // Existing channel importance is controlled by the user in system settings.
      const channel = await Notifications.setNotificationChannelAsync('default', { name: 'Pennywise', importance: AndroidImportance.HIGH, sound: 'default' });
      let permission = await Notifications.getPermissionsAsync();
      if (!active()) return null;
      if (permission.status !== 'granted' && permission.canAskAgain !== false && requestPermission) permission = await Notifications.requestPermissionsAsync();
      if (!active()) return null;
      if (permission.status !== 'granted') {
        report({ state: 'blocked', message: 'Android notifications are disabled. Allow Pennywise notifications in system settings.' }); return null;
      }
      if (channel?.importance === AndroidImportance.NONE) {
        report({ state: 'blocked', message: 'The Pennywise notification channel is disabled. Enable it in Android notification settings.' }); return null;
      }
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) throw new Error('This build is missing its Expo project ID. Rebuild with the correct app configuration.');
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      if (!active()) return null;
      await request('/me/push-token', { method: 'PUT', body: { token } });
      if (!active()) return null;
      registered = token;
      // Retain the token across restarts so logout can unregister even before
      // this launch's registration completes. Never log or display the token.
      await AsyncStorage.setItem(TOKEN_KEY, token);
      if (active()) report({ state: 'registered', message: 'This device is registered. Delivery also depends on Android settings and server push credentials.' });
      return active() ? token : null;
    } catch (error) {
      if (!active()) return null;
      report({ state: 'error', message: error instanceof Error ? error.message : 'Could not register notifications. Check your connection and retry.' });
      throw error;
    }
  })();
  pending = job;
  void job.finally(() => { if (pending === job) pending = null; }).catch(() => undefined);
  return job;
}
// Called before the session is cleared: afterwards the API would no longer accept the request.
export async function unregisterPush(timeoutMs = 2500) {
  cancelPushRegistration();
  const token = registered ?? await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  registered = null;
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);
  if (!token) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([request('/me/push-token', { method: 'DELETE', body: { token } }).catch(() => undefined), new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); })]); }
  finally { clearTimeout(timer); }
}
