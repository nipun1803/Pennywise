import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ExpenseForm from '@/app/(app)/group/[id]/expense';
import PaymentForm from '@/app/(app)/group/[id]/payment';

const mockMutate = jest.fn(); const mockResources = {}; const mockParams = { current: {} };
jest.mock('@/providers/app-provider', () => ({ useApp: () => ({ colors: require('../../src/theme/palette').palette.light, session: { user: { id: 'a', name: 'Alice' } }, offline: false, notify: jest.fn() }) }));
jest.mock('expo-router', () => ({ router: { canGoBack: jest.fn(() => true), back: jest.fn(), dismissTo: jest.fn() }, useLocalSearchParams: () => mockParams.current, useFocusEffect: jest.fn() }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: { View: require('react-native').View }, FadeIn: { duration: () => ({}) }, SlideInDown: { duration: () => ({}) } }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons/Feather', () => 'Icon');
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/lib/api', () => ({ request: jest.fn(), errorMessage: e => e.message }));
jest.mock('@/hooks/use-mutation', () => ({ useMutation: () => ({ busy: false, mutate: mockMutate }) }));
jest.mock('@/hooks/use-resource', () => ({ useResource: path => ({ data: undefined, loading: false, error: '', saved: false, reload: jest.fn(), ...mockResources[path] }) }));
jest.mock('@/components/member-picker', () => ({ MemberPicker: () => null }));
jest.mock('@/screens/category-manager', () => ({ CategoryPicker: () => null }));

const balances = [{ userId: 'a', name: 'Alice' }, { userId: 'b', name: 'Bob' }];
const expense = (amountCents, share) => ({ id: 'e1', description: 'Dinner', amountCents, paidBy: 'a', category: null, splits: [{ userId: 'a', shareCents: share }, { userId: 'b', shareCents: amountCents - share }] });
const set = (path, value) => { mockResources[path] = value; };
const disabled = label => screen.getByLabelText(label).props.accessibilityState.disabled;
beforeEach(() => { jest.clearAllMocks(); for (const key of Object.keys(mockResources)) delete mockResources[key]; mockMutate.mockResolvedValue({ data: { id: 'e1' } }); });

test('edit form waits for fresh expense data and saves the fresh values', async () => {
  mockParams.current = { id: 'g', eid: 'e1' }; set('/groups/g/balances', { data: balances });
  set('/groups/g/expenses/e1', { data: expense(10000, 5000), saved: true, loading: true });
  const view = await render(<ExpenseForm />);
  expect(screen.getByLabelText('Amount (₹ INR)').props.value).toBe(''); expect(disabled('Save changes')).toBe(true);
  set('/groups/g/expenses/e1', { data: expense(10000, 5000), saved: true, loading: false });
  await view.rerender(<ExpenseForm />);
  expect(screen.getByLabelText('Amount (₹ INR)').props.value).toBe(''); expect(disabled('Save changes')).toBe(true);
  set('/groups/g/expenses/e1', { data: expense(20000, 12000) });
  await view.rerender(<ExpenseForm />);
  expect(screen.getByLabelText('Amount (₹ INR)').props.value).toBe('200.00'); expect(screen.getByLabelText('Alice’s share (₹)').props.value).toBe('120.00'); expect(disabled('Save changes')).toBe(false);
  await fireEvent.press(screen.getByLabelText('Save changes'));
  expect(mockMutate).toHaveBeenCalledWith('/groups/g/expenses/e1', 'PUT', { description: 'Dinner', amountCents: 20000, paidBy: 'a', splitMode: 'custom', customSplits: [{ userId: 'a', shareCents: 12000 }, { userId: 'b', shareCents: 8000 }] }, false);
});
test('edit form opens in custom mode and offers an equal split among original people', async () => {
  mockParams.current = { id: 'g', eid: 'e1' }; set('/groups/g/balances', { data: balances }); set('/groups/g/expenses/e1', { data: expense(20000, 12000) });
  await render(<ExpenseForm />);
  expect(screen.getByRole('button', { name: 'Custom amounts' }).props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByText('Split equally among original people'));
  expect(screen.getByText('Shares will be recalculated equally among the original 2 participants, even if other members joined later.')).toBeTruthy();
  expect(screen.getByText('Split preview')).toBeTruthy(); expect(screen.getAllByText('₹100.00')).toHaveLength(2);
});
const pay = async () => { await fireEvent.changeText(screen.getByLabelText('Amount (₹ INR)'), '50'); await fireEvent.press(screen.getByLabelText('Record payment')); };
test('saved payment suggestions require confirmation before recording', async () => {
  mockParams.current = { id: 'g', from: 'a', to: 'b' }; set('/groups/g/balances', { data: balances }); set('/groups/g/settle-up', { data: [{ fromUser: 'a', toUser: 'b', amountCents: 10000 }], saved: true });
  await render(<PaymentForm />); await pay();
  expect(mockMutate).not.toHaveBeenCalled(); expect(screen.getByText('Suggested balances are unavailable. This payment may overpay or reverse a debt. Confirm the external payment record?')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Confirm payment record'));
  expect(mockMutate).toHaveBeenCalledWith('/groups/g/settlements', 'POST', { fromUser: 'a', toUser: 'b', amountCents: 5000 }, true);
});
test('fresh payment suggestions record an amount within the suggestion directly', async () => {
  mockParams.current = { id: 'g', from: 'a', to: 'b' }; set('/groups/g/balances', { data: balances }); set('/groups/g/settle-up', { data: [{ fromUser: 'a', toUser: 'b', amountCents: 10000 }] });
  await render(<PaymentForm />); await pay();
  expect(mockMutate).toHaveBeenCalledWith('/groups/g/settlements', 'POST', { fromUser: 'a', toUser: 'b', amountCents: 5000 }, true);
});
