import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { notificationRoute, registerForPush } from '@/lib/push';

// Keyed by account id so switching accounts on one device registers the token again.
export function usePushNotifications(userId: string | undefined, onReceive: () => void) {
  const lastResponse = Notifications.useLastNotificationResponse();
  const handled = useRef('');
  const refresh = useRef(onReceive);
  useEffect(() => { refresh.current = onReceive; });
  useEffect(() => {
    if (!userId) return;
    // Registration is best-effort: Expo Go, missing Firebase config or a denied prompt must not break sign-in.
    void registerForPush().catch(() => undefined);
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
  }, [userId, lastResponse]);
}
