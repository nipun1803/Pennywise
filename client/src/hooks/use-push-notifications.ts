import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { cancelPushRegistration, getPushStatus, notificationRoute, registerForPush, subscribePushStatus } from '@/lib/push';

export const usePushStatus = () => useSyncExternalStore(subscribePushStatus, getPushStatus, getPushStatus);

// Keyed by account id so switching accounts on one device registers the token again.
export function usePushNotifications(userId: string | undefined, onReceive: () => void, offline = false) {
  const lastResponse = Notifications.useLastNotificationResponse();
  const handled = useRef('');
  const refresh = useRef(onReceive);
  useEffect(() => { refresh.current = onReceive; });
  useEffect(() => {
    if (!userId || offline || Platform.OS !== 'android') return;
    let active = true; let retries = 0; let timer: ReturnType<typeof setTimeout> | undefined;
    const register = (requestPermission = false) => {
      if (!active) return;
      void registerForPush({ requestPermission }).catch(() => {
        console.warn('Push registration failed. See Profile → Notifications for details.');
        if (active && retries < 3 && !timer) timer = setTimeout(() => { timer = undefined; register(); }, 2000 * 2 ** retries++);
      });
    };
    register(true);
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') register(); });
    const token = Notifications.addPushTokenListener(() => register());
    return () => { active = false; clearTimeout(timer); foreground.remove(); token.remove(); cancelPushRegistration(); };
  }, [userId, offline]);
  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationReceivedListener(() => refresh.current());
    return () => subscription.remove();
  }, [userId]);
  useEffect(() => {
    if (!userId || !lastResponse) return;
    const id = lastResponse.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const route = notificationRoute(lastResponse.notification.request.content.data);
    if (route) router.push(route);
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }, [userId, lastResponse]);
}
