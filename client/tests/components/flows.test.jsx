import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Sheet, SheetRow } from '@/components/sheet';
import { PasswordField, Avatar } from '@/components/ui/app-ui';
import Join from '@/app/join';
import ExpenseForm from '@/app/(app)/group/[id]/expense';
import PaymentForm from '@/app/(app)/group/[id]/payment';
import { SplitPreview } from '@/components/split-preview';
import { FloatingTabBar } from '@/components/floating-tab-bar';
import { StyleSheet } from 'react-native';
import { request } from '@/lib/api';
import { router } from 'expo-router';

jest.mock('@/providers/app-provider', () => ({ useApp: () => ({ colors: require('../../src/theme/palette').palette.light, session: { user: { id: 'a', name: 'Alice' } }, offline: false, pendingCode: '', setPendingCode: jest.fn(), invalidate: jest.fn(), notify: jest.fn() }) }));
jest.mock('expo-router', () => ({ router: { canGoBack: jest.fn(() => true), back: jest.fn(), replace: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({ id: 'group' }), useFocusEffect: jest.fn() }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: { View: require('react-native').View }, FadeIn: { duration: () => ({}) }, SlideInDown: { duration: () => ({}) } }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons/Feather', () => 'Icon');
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/lib/api', () => ({ request: jest.fn(), errorMessage: e => e.message }));
jest.mock('@/hooks/use-mutation', () => ({ useMutation: () => ({ busy: false, mutate: jest.fn() }) }));
jest.mock('@/hooks/use-resource', () => ({ useResource: () => ({ data: undefined, reload: jest.fn() }) }));
jest.mock('@/components/member-picker', () => ({ MemberPicker: () => null }));
jest.mock('@/screens/category-manager', () => ({ CategoryPicker: () => null }));

beforeEach(() => jest.clearAllMocks());
const tabRoutes = ['home', 'groups', 'activity', 'reports'].map(name => ({ name, key: name }));
const tabDescriptors = Object.fromEntries(tabRoutes.map(route => [route.key, { options: { title: route.name[0].toUpperCase() + route.name.slice(1) } }]));
test('tab bar keeps the selected icon in its layout and exposes all four tabs', async () => {
  await render(<FloatingTabBar state={{ index: 0, routes: tabRoutes }} descriptors={tabDescriptors} emitter={{ emit: jest.fn() }} navigateToTab={jest.fn()} />);
  expect(screen.getAllByRole('tab')).toHaveLength(4);
  expect(screen.getByRole('tab', { name: 'Home', selected: true })).toBeTruthy();
  const selectedIcon = screen.getByTestId('tab-icon-home');
  expect(StyleSheet.flatten(selectedIcon.props.style).transform).toBeUndefined();
  expect(StyleSheet.flatten(screen.getByTestId('floating-tab-bar').props.style).paddingVertical).toBe(10);
});
test('tab presses navigate and long presses emit the matching event', async () => {
  const emit = jest.fn(() => ({ defaultPrevented: false })); const navigate = jest.fn();
  await render(<FloatingTabBar state={{ index: 0, routes: tabRoutes }} descriptors={tabDescriptors} emitter={{ emit }} navigateToTab={navigate} />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Groups' }));
  expect(navigate).toHaveBeenCalledWith('groups');
  await fireEvent(screen.getByRole('tab', { name: 'Reports' }), 'longPress');
  expect(emit).toHaveBeenCalledWith({ type: 'tabLongPress', target: 'reports' });
});
test('selected and prevented tab presses do not navigate', async () => {
  const navigate = jest.fn(); const emit = jest.fn(() => ({ defaultPrevented: true }));
  await render(<FloatingTabBar state={{ index: 0, routes: tabRoutes }} descriptors={tabDescriptors} emitter={{ emit }} navigateToTab={navigate} />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
  await fireEvent.press(screen.getByRole('tab', { name: 'Activity' }));
  expect(navigate).not.toHaveBeenCalled();
});
test('sheet close dismisses and its action is tappable', async () => {
  const action = jest.fn();
  await render(<Sheet title="Group options"><SheetRow title="Invite people" icon="users" onPress={action} /></Sheet>);
  await fireEvent.press(screen.getByText('Invite people'));
  expect(action).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(router.back).toHaveBeenCalledTimes(1);
});
test('password visibility toggles without losing input', async () => {
  await render(<PasswordField label="Password" value="Password123!" />);
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  await fireEvent.press(screen.getByLabelText('Show password'));
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
  expect(screen.getByLabelText('Password').props.value).toBe('Password123!');
});
test('missing photo falls back to name initials', async () => {
  await render(<Avatar name="Nipun Reddy" />);
  expect(screen.getByText('NR')).toBeTruthy();
});
test('join rejects an invalid code without calling the API', async () => {
  await render(<Join />);
  await fireEvent.press(screen.getByLabelText('Join group'));
  expect(screen.getByText('Enter a valid six-character group code.')).toBeTruthy();
  expect(request).not.toHaveBeenCalled();
});
test('join normalizes a code and navigates to the joined group', async () => {
  request.mockResolvedValue({ data: { id: 'joined', name: 'Trip' } });
  await render(<Join />);
  await fireEvent.changeText(screen.getByLabelText('Group code'), 'k7m2qx');
  await fireEvent.press(screen.getByLabelText('Join group'));
  expect(request).toHaveBeenCalledWith('/groups/join', { method: 'POST', body: { code: 'K7M2QX' } });
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/group/[id]', params: { id: 'joined' } });
});
test('expense form rejects an empty description', async () => {
  await render(<ExpenseForm />);
  await fireEvent.press(screen.getByLabelText('Save expense'));
  expect(screen.getByText('Describe this expense.')).toBeTruthy();
});
test('payment form requires a recipient', async () => {
  await render(<PaymentForm />);
  await fireEvent.press(screen.getByLabelText('Record payment'));
  expect(screen.getByText('Choose a sender and recipient.')).toBeTruthy();
});

test('even split preview distributes the remaining paise exactly', async () => {
  await render(<SplitPreview members={[{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Charlie' }]} custom={false} values={{}} onChange={jest.fn()} total={100} />);
  expect(screen.getByText('₹0.34')).toBeTruthy();
  expect(screen.getAllByText('₹0.33')).toHaveLength(2);
});
test('custom share input updates the selected member only', async () => {
  const change = jest.fn();
  await render(<SplitPreview members={[{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }]} custom values={{ a: '10', b: '90' }} onChange={change} total={10000} />);
  await fireEvent.changeText(screen.getByLabelText('Alice’s share (₹)'), '25');
  expect(change).toHaveBeenCalledWith({ a: '25', b: '90' });
});
