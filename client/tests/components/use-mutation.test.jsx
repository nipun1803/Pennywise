import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uuid } from 'expo';
import { useMutation } from '@/hooks/use-mutation';
import { request } from '@/lib/api';
import { useApp } from '@/providers/app-provider';

// Reproduce the Android runtime: importing ExpoCrypto must fail, not be silently mocked.
jest.mock('expo-crypto', () => { throw new Error("Cannot find native module 'ExpoCrypto'"); }, { virtual: true });
// Plain functions (not jest.fn) so resetAllMocks keeps a working, restart-surviving store.
jest.mock('@react-native-async-storage/async-storage', () => {
  const memory = new Map();
  return { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value); }, removeItem: async key => { memory.delete(key); }, getAllKeys: async () => [...memory.keys()], multiRemove: async keys => keys.forEach(key => memory.delete(key)), clear: async () => memory.clear() };
});
jest.mock('@/lib/api', () => ({ ApiError: class extends Error { constructor(message, status = 0) { super(message); this.status = status; } }, request: jest.fn() }));
jest.mock('@/providers/app-provider', () => ({ useApp: jest.fn() }));

const invalidate = jest.fn();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const signedIn = id => useApp.mockReturnValue({ session: { user: { id } }, offline: false, invalidate });
const intents = async () => (await AsyncStorage.getAllKeys()).filter(key => key.startsWith('pennywise.intent.v1.'));

beforeEach(async () => {
  jest.resetAllMocks();
  await AsyncStorage.clear();
  signedIn('alice');
});
afterEach(() => jest.restoreAllMocks());

test('loads without ExpoCrypto and uses Expo core UUIDs for new creation intents', async () => {
  request.mockResolvedValue({ data: { id: 'saved' } });
  const { result } = await renderHook(useMutation);
  const body = { amountCents: 100 };

  await act(async () => { await result.current.mutate('/expenses', 'POST', body, true); });
  const firstKey = request.mock.calls[0][1].key;
  expect(firstKey).toMatch(uuidPattern);

  await act(async () => { await result.current.mutate('/expenses', 'POST', body, true); });
  const nextKey = request.mock.calls[1][1].key;
  expect(nextKey).toMatch(uuidPattern);
  expect(nextKey).not.toBe(firstKey);
  expect(invalidate).toHaveBeenCalledTimes(2);
  expect(result.current.busy).toBe(false);
});

test('blocks duplicate taps and preserves the UUID and payload across rerenders after uncertainty', async () => {
  let rejectRequest;
  request.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRequest = reject; }))
    .mockResolvedValue({ data: { id: 'saved' } });
  const { result } = await renderHook(useMutation);
  const body = { amountCents: 100 };
  let pending;

  await act(() => { pending = result.current.mutate('/payments', 'POST', body, true); });
  expect(result.current.busy).toBe(true);
  await expect(result.current.mutate('/payments', 'POST', body, true)).rejects.toThrow('A save is already in progress.');
  expect(request).toHaveBeenCalledTimes(1);

  await act(async () => {
    rejectRequest(new Error('Network timeout'));
    await expect(pending).rejects.toThrow('Network timeout');
  });
  expect(result.current.busy).toBe(false);
  expect(invalidate).not.toHaveBeenCalled();
  await expect(result.current.mutate('/payments', 'POST', { amountCents: 200 }, true)).rejects.toThrow('The previous save may have succeeded.');
  expect(request).toHaveBeenCalledTimes(1);

  await act(async () => { await result.current.mutate('/payments', 'POST', body, true); });
  expect(request.mock.calls[1][1]).toEqual(request.mock.calls[0][1]);
  expect(invalidate).toHaveBeenCalledTimes(1);
});

test('UUID failure sends no creation request, does not lock the form, and does not block ordinary edits', async () => {
  const generator = jest.spyOn(uuid, 'v4').mockImplementation(() => { throw new Error('UUID generator unavailable'); });
  request.mockResolvedValue({ data: {} });
  const { result } = await renderHook(useMutation);

  await expect(result.current.mutate('/expenses', 'POST', {}, true)).rejects.toThrow('UUID generator unavailable');
  expect(request).not.toHaveBeenCalled();
  expect(result.current.busy).toBe(false);

  await act(async () => { await result.current.mutate('/me', 'PATCH', { name: 'Alice' }); });
  expect(request).toHaveBeenCalledWith('/me', { method: 'PATCH', body: { name: 'Alice' } });
  expect(generator).toHaveBeenCalledTimes(1);

  generator.mockRestore();
  await act(async () => { await result.current.mutate('/expenses', 'POST', {}, true); });
  expect(request.mock.calls[1][1].key).toMatch(uuidPattern);
  expect(result.current.busy).toBe(false);
});

test('an uncertain creation survives remounts and reuses its key', async () => {
  request.mockRejectedValueOnce(new Error('Network timeout')).mockResolvedValue({ data: { id: 'saved' } });
  const body = { amountCents: 100 };
  const first = await renderHook(useMutation);
  await act(async () => { await expect(first.result.current.mutate('/expenses', 'POST', body, true)).rejects.toThrow('Network timeout'); });
  await first.unmount();
  expect(await intents()).toHaveLength(1);

  const { result } = await renderHook(useMutation);
  await act(async () => { await result.current.mutate('/expenses', 'POST', body, true); });
  expect(request.mock.calls[1][1].key).toBe(request.mock.calls[0][1].key);
  expect(await intents()).toHaveLength(0);
});

test('success clears the stored intent so a later identical record gets a new key', async () => {
  request.mockResolvedValue({ data: { id: 'saved' } });
  const body = { amountCents: 100 };
  const first = await renderHook(useMutation);
  await act(async () => { await first.result.current.mutate('/expenses', 'POST', body, true); });
  await first.unmount();
  expect(await intents()).toHaveLength(0);
  const { result } = await renderHook(useMutation);
  await act(async () => { await result.current.mutate('/expenses', 'POST', body, true); });
  expect(request.mock.calls[1][1].key).not.toBe(request.mock.calls[0][1].key);
});

test('definite rejections clear the stored intent', async () => {
  const { ApiError } = jest.requireMock('@/lib/api');
  request.mockRejectedValueOnce(new ApiError('Invalid expense', 400)).mockResolvedValue({ data: {} });
  const body = { amountCents: 100 };
  const first = await renderHook(useMutation);
  await act(async () => { await expect(first.result.current.mutate('/expenses', 'POST', body, true)).rejects.toThrow('Invalid expense'); });
  await first.unmount();
  expect(await intents()).toHaveLength(0);
  const { result } = await renderHook(useMutation);
  await act(async () => { await result.current.mutate('/expenses', 'POST', body, true); });
  expect(request.mock.calls[1][1].key).not.toBe(request.mock.calls[0][1].key);
});

test('server errors keep the stored intent; another account never reuses it', async () => {
  const { ApiError } = jest.requireMock('@/lib/api');
  request.mockRejectedValueOnce(new ApiError('Unavailable', 503)).mockResolvedValue({ data: {} });
  const body = { amountCents: 100 };
  const first = await renderHook(useMutation);
  await act(async () => { await expect(first.result.current.mutate('/expenses', 'POST', body, true)).rejects.toThrow('Unavailable'); });
  await first.unmount();
  signedIn('bob');
  const { result } = await renderHook(useMutation);
  await act(async () => { await result.current.mutate('/expenses', 'POST', body, true); });
  expect(request.mock.calls[1][1].key).not.toBe(request.mock.calls[0][1].key);
  expect(await intents()).toEqual([expect.stringContaining('pennywise.intent.v1.alice.')]);
});
