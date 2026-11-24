jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  useLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  setNotificationChannelAsync: jest.fn(), getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(), getExpoPushTokenAsync: jest.fn(),
  AndroidImportance: { NONE: 0, DEFAULT: 3, HIGH: 4 },
}));
