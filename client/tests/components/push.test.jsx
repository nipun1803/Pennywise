import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { NotificationSettings } from '@/components/notification-settings';
import { notificationRoute, registerForPush, unregisterPush } from '@/lib/push';
import { request } from '@/lib/api';

const mockMutate = jest.fn(); const mockUpdateUser = jest.fn();
const mockApp = { colors: require('../../src/theme/palette').palette.light, offline: false, session: { user: { id: 'member', notifications: { expenses: true, payments: false, members: true } } }, updateUser: mockUpdateUser, message: '' };
jest.mock('@/providers/app-provider', () => ({ useApp: () => mockApp }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons/Feather', () => 'Icon');
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/hooks/use-mutation', () => ({ useMutation: () => ({ busy: false, mutate: mockMutate }) }));
jest.mock('@/lib/api', () => ({ request: jest.fn(), errorMessage: e => e.message }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'project-id' } } } } }));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(), setNotificationChannelAsync: jest.fn(), getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(), AndroidImportance: { DEFAULT: 3 },
}));

const groupId = '507f1f77bcf86cd799439011';
beforeEach(() => {
  jest.clearAllMocks(); jest.replaceProperty(Platform, 'OS', 'android'); Device.isDevice = true;
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
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
