import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { uuid } from 'expo';
import { useMutation } from '@/hooks/use-mutation';
import { request } from '@/lib/api';
import { useApp } from '@/providers/app-provider';

// Reproduce the Android runtime: importing ExpoCrypto must fail, not be silently mocked.
jest.mock('expo-crypto', () => { throw new Error("Cannot find native module 'ExpoCrypto'"); }, { virtual: true });
jest.mock('@/lib/api', () => ({ ApiError: class extends Error {}, request: jest.fn() }));
jest.mock('@/providers/app-provider', () => ({ useApp: jest.fn() }));

const invalidate = jest.fn();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  jest.resetAllMocks();
  useApp.mockReturnValue({ offline: false, invalidate });
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
