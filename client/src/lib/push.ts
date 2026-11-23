import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import { request } from './api';

// Show pushes as banners while the app is open; the screens refresh themselves.
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });

let registered: string | null = null;
export function notificationRoute(data: unknown) {
  const groupId = data && typeof data === 'object' ? (data as { groupId?: unknown }).groupId : undefined;
  return typeof groupId === 'string' && /^[a-f\d]{24}$/i.test(groupId) ? { pathname: '/group/[id]', params: { id: groupId } } as const : null;
}
// Returns the Expo push token once this device is registered with the API, or null when
// push is unavailable (iOS, emulators, permission denied, or a build without Firebase).
export async function registerForPush() {
  if (Platform.OS !== 'android' || !Device.isDevice) return null;
  // Android 13+ only shows the permission prompt once a channel exists.
  await Notifications.setNotificationChannelAsync('default', { name: 'Pennywise', importance: AndroidImportance.DEFAULT });
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (status !== 'granted' || !projectId) return null;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await request('/me/push-token', { method: 'PUT', body: { token } });
  registered = token;
  return token;
}
// Called before the session is cleared: afterwards the API would no longer accept the request.
export async function unregisterPush(timeoutMs = 2500) {
  const token = registered;
  if (!token) return;
  registered = null;
  await Promise.race([request('/me/push-token', { method: 'DELETE', body: { token } }).catch(() => undefined), new Promise(resolve => setTimeout(resolve, timeoutMs))]);
}
