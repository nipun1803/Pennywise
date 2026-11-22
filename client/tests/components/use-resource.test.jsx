import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useResource } from '@/hooks/use-resource';
import { request } from '@/lib/api';
import { readCache, removeCache, writeCache } from '@/lib/storage';
import { useApp } from '@/providers/app-provider';

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: callback => useEffect(callback, [callback]) };
});
jest.mock('@/lib/api', () => ({ ApiError: class extends Error { constructor(message, status = 0) { super(message); this.status = status; } }, request: jest.fn(), errorMessage: error => error.message }));
jest.mock('@/lib/storage', () => ({ cacheVersion: () => 0, readCache: jest.fn(), removeCache: jest.fn(), writeCache: jest.fn() }));
jest.mock('@/providers/app-provider', () => ({ useApp: jest.fn() }));

beforeEach(() => {
  jest.resetAllMocks();
  useApp.mockReturnValue({ session: { user: { id: 'alice' } }, offline: false, revision: 0 });
  readCache.mockResolvedValue(null);
  writeCache.mockResolvedValue(undefined);
  removeCache.mockResolvedValue(undefined);
  request.mockResolvedValue({ data: ['fresh'] });
});

test('inactive resources do not load or fetch, including after disabling an active path', async () => {
  const { result, rerender } = await renderHook(({ path }) => useResource(path), { initialProps: { path: null } });
  expect(result.current.loading).toBe(false);
  expect(request).not.toHaveBeenCalled();
  await rerender({ path: '/groups' });
  await waitFor(() => expect(result.current.data).toEqual(['fresh']));
  await rerender({ path: null });
  expect(result.current.loading).toBe(false);
  expect(result.current.data).toBeUndefined();
});

test('no session means no loading and no cache or network request', async () => {
  useApp.mockReturnValue({ session: null, offline: false, revision: 0 });
  const { result } = await renderHook(() => useResource('/groups'));
  expect(result.current.loading).toBe(false);
  expect(readCache).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

test('offline reads use account cache and do not fetch', async () => {
  useApp.mockReturnValue({ session: { user: { id: 'alice' } }, offline: true, revision: 0 });
  readCache.mockResolvedValue({ data: ['saved'] });
  const { result } = await renderHook(() => useResource('/groups'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual(['saved']);
  expect(result.current.saved).toBe(true);
  expect(result.current.error).toBe('');
  expect(readCache).toHaveBeenCalledWith('alice', '/groups');
  expect(request).not.toHaveBeenCalled();
});

test('offline cache misses do not claim to have saved data', async () => {
  useApp.mockReturnValue({ session: { user: { id: 'alice' } }, offline: true, revision: 0 });
  const { result } = await renderHook(() => useResource('/groups'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.saved).toBe(false);
  expect(result.current.error).toContain('No saved data');
});

test('failed network reads retain cached data', async () => {
  readCache.mockResolvedValue({ data: ['saved'] });
  request.mockRejectedValue(new Error('Network timeout'));
  const { result } = await renderHook(() => useResource('/groups'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual(['saved']);
  expect(result.current.saved).toBe(true);
  expect(result.current.error).toBe('Network timeout');
  expect(removeCache).not.toHaveBeenCalled();
});

test('deleted or inaccessible records drop cached data and its cache entry', async () => {
  const { ApiError } = jest.requireMock('@/lib/api');
  readCache.mockResolvedValue({ data: { id: 'expense' } });
  request.mockRejectedValue(new ApiError('Expense not found', 404));
  const { result } = await renderHook(() => useResource('/groups/g/expenses/e'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toBeUndefined();
  expect(result.current.saved).toBe(false);
  expect(result.current.error).toBe('Expense not found');
  expect(removeCache).toHaveBeenCalledWith('alice', '/groups/g/expenses/e');
});

test('late responses cannot overwrite a new path or populate its cache', async () => {
  let resolveOld;
  request.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  const { result, rerender } = await renderHook(({ path }) => useResource(path), { initialProps: { path: '/old' } });
  await waitFor(() => expect(request).toHaveBeenCalledWith('/old'));
  await rerender({ path: '/new' });
  await waitFor(() => expect(result.current.data).toEqual(['fresh']));
  await act(async () => { resolveOld({ data: ['old'] }); });
  expect(result.current.data).toEqual(['fresh']);
  expect(writeCache).toHaveBeenCalledTimes(1);
  expect(writeCache).toHaveBeenCalledWith('alice', '/new', { data: ['fresh'] }, 0);
});
