import React from 'react';
import { render, renderHook, act, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { NotificationSettings } from '@/components/notification-settings';
import { cancelPushRegistration, getPushStatus, notificationRoute, registerForPush, unregisterPush } from '@/lib/push';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { request } from '@/lib/api';

const mockMutate = jest.fn(); const mockUpdateUser = jest.fn();
let mockSessionToken = 'session-a';
const mockApp = { colors: require('../../src/theme/palette').palette.light, offline: false, session: { user: { id: 'member', notifications: { expenses: true, payments: false, members: true } } }, updateUser: mockUpdateUser, message: '' };
jest.mock('@/providers/app-provider', () => ({ useApp: () => mockApp }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons/Feather', () => 'Icon');
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/hooks/use-mutation', () => ({ useMutation: () => ({ busy: false, mutate: mockMutate }) }));
jest.mock('@/lib/api', () => ({ request: jest.fn(), getSessionToken: () => mockSessionToken, errorMessage: e => e.message }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'project-id' } } } } }));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(), setNotificationChannelAsync: jest.fn(), getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(), AndroidImportance: { NONE: 0, DEFAULT: 3, HIGH: 4 },
  useLastNotificationResponse: jest.fn(() => null), clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })), addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
}));

const groupId = '507f1f77bcf86cd799439011';
const notificationHandler = Notifications.setNotificationHandler.mock.calls[0][0];
beforeEach(async () => {
  request.mockResolvedValue({ data: undefined });
  await unregisterPush(10);
  jest.clearAllMocks(); jest.replaceProperty(Platform, 'OS', 'android'); Device.isDevice = true;
  mockSessionToken = 'session-a';
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Notifications.setNotificationChannelAsync.mockResolvedValue({ importance: 4 });
  Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
  request.mockResolvedValue({ data: undefined });
});

test('notification taps open the group only for a well-formed group id', () => {
  expect(notificationRoute({ type: 'expense', groupId })).toEqual({ pathname: '/group/[id]', params: { id: groupId } });
  for (const data of [null, undefined, 'text', {}, { groupId: 42 }, { groupId: '../../login' }, { groupId: `${groupId}0` }]) expect(notificationRoute(data)).toBeNull();
});
test('registration creates the channel before prompting, then sends the Expo token to the API', async () => {
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
  Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
  await expect(registerForPush()).resolves.toBe('ExponentPushToken[abc]');
  expect(Notifications.setNotificationChannelAsync.mock.invocationCallOrder[0]).toBeLessThan(Notifications.requestPermissionsAsync.mock.invocationCallOrder[0]);
  expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project-id' });
  expect(request).toHaveBeenCalledWith('/me/push-token', { method: 'PUT', body: { token: 'ExponentPushToken[abc]' } });
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('default', expect.objectContaining({ importance: 4, sound: 'default' }));
  expect(getPushStatus().state).toBe('registered');
});
test('foreground notifications permit Android banners and sound', async () => {
  expect(await notificationHandler.handleNotification()).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
});
test('a failed registration is visible and a subsequent attempt recovers', async () => {
  request.mockRejectedValueOnce(new Error('Could not reach Pennywise.'));
  await expect(registerForPush()).rejects.toThrow('Could not reach Pennywise.');
  expect(getPushStatus()).toEqual({ state: 'error', message: 'Could not reach Pennywise.' });
  await expect(registerForPush()).resolves.toBe('ExponentPushToken[abc]');
  expect(getPushStatus().state).toBe('registered');
});
test('a permanently denied permission is explained without prompting again', async () => {
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
  await expect(registerForPush()).resolves.toBeNull();
  expect(getPushStatus().state).toBe('blocked');
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});
test('a muted Android channel is explained even when app permission is granted', async () => {
  Notifications.setNotificationChannelAsync.mockResolvedValue({ importance: 0 });
  await expect(registerForPush()).resolves.toBeNull();
  expect(getPushStatus()).toMatchObject({ state: 'blocked', message: expect.stringContaining('channel is disabled') });
  expect(request).not.toHaveBeenCalled();
});
test('in-flight native token acquisition cannot register after the session changes', async () => {
  let resolve;
  Notifications.getExpoPushTokenAsync.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const registration = registerForPush();
  await waitFor(() => expect(resolve).toBeDefined());
  expect(registerForPush()).toBe(registration);
  mockSessionToken = 'session-b'; cancelPushRegistration();
  resolve({ data: 'ExponentPushToken[old]' });
  await expect(registration).resolves.toBeNull();
  expect(request).not.toHaveBeenCalled();
});
test('logout removes the persisted token even before registration on this launch', async () => {
  await AsyncStorage.setItem('pennywise.push-token', 'ExponentPushToken[saved]');
  await unregisterPush(10);
  expect(request).toHaveBeenCalledWith('/me/push-token', { method: 'DELETE', body: { token: 'ExponentPushToken[saved]' } });
  expect(await AsyncStorage.getItem('pennywise.push-token')).toBeNull();
});
test('registration is skipped when permission is denied, off Android, or on an emulator', async () => {
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' }); Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
  await expect(registerForPush()).resolves.toBeNull();
  jest.replaceProperty(Platform, 'OS', 'ios');
  await expect(registerForPush()).resolves.toBeNull();
  jest.replaceProperty(Platform, 'OS', 'android'); Device.isDevice = false;
  await expect(registerForPush()).resolves.toBeNull();
  expect(request).not.toHaveBeenCalled();
});
test('logout removes the registered token once and never waits long for a slow network', async () => {
  await registerForPush(); request.mockClear();
  request.mockReturnValue(new Promise(() => undefined));
  await unregisterPush(10);
  expect(request).toHaveBeenCalledWith('/me/push-token', { method: 'DELETE', body: { token: 'ExponentPushToken[abc]' } });
  await unregisterPush(10);
  expect(request).toHaveBeenCalledTimes(1);
});
test('notification switches show saved preferences and save one type at a time', async () => {
  mockMutate.mockResolvedValue({ data: { id: 'member', notifications: { expenses: true, payments: true, members: true } } });
  await render(<NotificationSettings />);
  expect(screen.getByLabelText('Expenses notifications').props.on).toBe(true);
  expect(screen.getByLabelText('Payments notifications').props.on).toBe(false);
  await fireEvent(screen.getByLabelText('Payments notifications'), 'valueChange', true);
  await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'member' })));
  expect(mockMutate).toHaveBeenCalledWith('/me/notifications', 'PATCH', { payments: true });
});
test('a failed preference save is reported instead of silently ignored', async () => {
  mockMutate.mockRejectedValue(new Error('Could not reach Pennywise.'));
  await render(<NotificationSettings />);
  await fireEvent(screen.getByLabelText('Expenses notifications'), 'valueChange', false);
  expect(await screen.findByText('Could not reach Pennywise.')).toBeTruthy();
  expect(mockUpdateUser).not.toHaveBeenCalled();
});

test('the hook retries registration after a network error and reconnect', async () => {
  request.mockRejectedValueOnce(new Error('Network failed'));
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.useFakeTimers();
  try {
    const hook = await renderHook(({ offline }) => usePushNotifications('member', jest.fn(), offline), { initialProps: { offline: false } });
    await act(async () => { await Promise.resolve(); });
    expect(getPushStatus().state).toBe('error');
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(getPushStatus().state).toBe('registered');
    await hook.rerender({ offline: true });
    request.mockClear();
    await hook.rerender({ offline: false });
    await act(async () => { await Promise.resolve(); });
    expect(request).toHaveBeenCalledWith('/me/push-token', expect.objectContaining({ method: 'PUT' }));
    await hook.unmount();
    request.mockClear();
    await act(async () => { jest.runOnlyPendingTimers(); });
    expect(request).not.toHaveBeenCalled();
  } finally { jest.useRealTimers(); warning.mockRestore(); }
});
test('returning from Android settings and token rotation recheck registration', async () => {
  let foreground;
  const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => { foreground = callback; return { remove: jest.fn() }; });
  try {
    const hook = await renderHook(() => usePushNotifications('member', jest.fn()));
    await waitFor(() => expect(getPushStatus().state).toBe('registered'));
    request.mockClear();
    await act(async () => { foreground('active'); });
    expect(request).toHaveBeenCalledTimes(1);
    request.mockClear();
    await act(async () => { Notifications.addPushTokenListener.mock.calls.at(-1)[0](); });
    expect(request).toHaveBeenCalledTimes(1);
    await hook.unmount();
  } finally { listener.mockRestore(); }
});
