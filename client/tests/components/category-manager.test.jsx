import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { CategoryManager } from '@/screens/category-manager';

const mockMutate = jest.fn(); const mockApp = { session: { user: { id: 'a' } } };
const mockArchived = { id: 'c1', name: 'Snacks', icon: 'food', color: 'amber', standard: false, archivedAt: '2026-01-01T00:00:00.000Z' };
jest.mock('@/providers/app-provider', () => ({ useApp: () => ({ colors: require('../../src/theme/palette').palette.light, offline: false, notify: jest.fn(), ...mockApp }) }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: { View: require('react-native').View }, FadeIn: { duration: () => ({}) }, SlideInDown: { duration: () => ({}) } }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons/Feather', () => 'Icon');
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/lib/api', () => ({ request: jest.fn(), errorMessage: e => e.message }));
jest.mock('@/hooks/use-mutation', () => ({ useMutation: () => ({ busy: false, mutate: mockMutate }) }));
jest.mock('@/hooks/use-resource', () => ({ useResource: path => path.includes('/categories') ? { data: [mockArchived], reload: jest.fn() } : { data: { createdBy: 'a' }, reload: jest.fn() } }));

beforeEach(() => { jest.clearAllMocks(); mockApp.session = { user: { id: 'a' } }; mockMutate.mockResolvedValue({ data: { ...mockArchived, archivedAt: null } }); });
test('the group creator can reopen an archived custom category and restore it', async () => {
  await render(<CategoryManager groupId="g" />);
  await fireEvent.press(screen.getByText('Snacks'));
  expect(screen.queryByText('Archive category')).toBeNull();
  await fireEvent.press(screen.getByText('Restore category'));
  expect(mockMutate).toHaveBeenCalledWith('/groups/g/categories/c1', 'PATCH', { archived: false });
});
test('archived categories stay unselectable when picking', async () => {
  const onSelect = jest.fn();
  await render(<CategoryManager groupId="g" onSelect={onSelect} />);
  await fireEvent.press(screen.getByText('Snacks'));
  expect(onSelect).not.toHaveBeenCalled();
});
test('archived categories stay closed to members who did not create the group', async () => {
  mockApp.session = { user: { id: 'b' } };
  await render(<CategoryManager groupId="g" />);
  await fireEvent.press(screen.getByText('Snacks'));
  expect(screen.queryByText('Restore category')).toBeNull();
});
