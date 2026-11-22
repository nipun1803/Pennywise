const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => { if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`); return mocks[name]; }, process: { env: {} }, setTimeout, clearTimeout, AbortController, ...globals }, { filename: file });
  return exports;
}
const format = load('lib/format.ts');

test('INR formats exact paise, Indian grouping, signs and largest safe amounts', () => {
  assert.equal(format.formatINR(12345650), '₹1,23,456.50');
  assert.equal(format.formatINR(1), '₹0.01'); assert.equal(format.formatINR(0), '₹0.00');
  assert.equal(format.formatINR(-100), '−₹1.00');
  assert.equal(format.formatINR(Number.MAX_SAFE_INTEGER), '₹9,00,71,99,25,47,409.91');
  assert.throws(() => format.formatINR(1.1));
});
test('compact amounts drop whole-rupee paise but keep real paise and signs', () => {
  assert.equal(format.formatAmount(150000), '₹1,500'); assert.equal(format.formatAmount(0), '₹0');
  assert.equal(format.formatAmount(1250), '₹12.50'); assert.equal(format.formatAmount(-75000), '−₹750');
});
test('amount inputs reject zero, negatives, extra decimals, exponents and overflow', () => {
  assert.equal(format.parseINR(' 123456.50 '), 12345650); assert.equal(format.parseINR('0.01'), 1);
  assert.equal(format.parseINR('90071992547409.91'), Number.MAX_SAFE_INTEGER);
  for (const invalid of ['0', '-1', '1.001', '1e3', '₹1', '1,000', '', '.5', '90071992547409.92']) assert.throws(() => format.parseINR(invalid));
});
test('join codes only normalize valid six-character codes, and names use initials', () => {
  assert.equal(format.isJoinCode(' k7m2qx '), true);
  for (const code of ['I0O1LZ', 'ABCDE', 'ABCDEFG', 'https://test/K7M2QX']) assert.equal(format.isJoinCode(code), false);
  assert.equal(format.greeting(' Priya Sharma '), 'Hi, Priya'); assert.equal(format.initials('Priya Sharma'), 'PS');
  assert.equal(format.initials(' Nipun '), 'NI'); assert.equal(format.initials('Trip'), 'TR'); assert.equal(format.initials(''), '');
});
test('JWT expiry is decoded locally without claiming signature verification', () => {
  const token = `header.${Buffer.from(JSON.stringify({ exp: 1800000000 })).toString('base64url')}.signature`;
  assert.equal(format.tokenExpiry(token), 1800000000000);
  assert.throws(() => format.tokenExpiry('invalid'));
});
test('protected 401 expires session; invalid login credentials do not', async () => {
  const api = load('lib/api.ts', { 'react-native': { Platform: { OS: 'web' } } }, { fetch: async () => ({ status: 401, ok: false, json: async () => ({ error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' } }) }) });
  let expired = 0; api.configureSession('token', () => expired++);
  await assert.rejects(api.request('/auth/login', { public: true }), /Invalid credentials/); assert.equal(expired, 0);
  await assert.rejects(api.request('/me'), /Invalid credentials/); assert.equal(expired, 1);
});
test('responses from a previous session cannot become another account’s data', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const api = load('lib/api.ts', { 'react-native': { Platform: { OS: 'web' } } }, { fetch: async () => { await gate; return { status: 200, ok: true, json: async () => ({ data: ['old-account'] }) }; } });
  api.configureSession('old'); const pending = api.request('/groups'); api.configureSession('new'); release();
  await assert.rejects(pending, error => error.code === 'SESSION_CHANGED');
});
test('native session storage is SecureStore only; FIFO logout beats profile saves', async () => {
  const memory = new Map(); const secure = new Map();
  const asyncStorage = { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => memory.set(key, value), getAllKeys: async () => [...memory.keys()], multiRemove: async keys => keys.forEach(key => memory.delete(key)) };
  const store = load('lib/storage.ts', { '@react-native-async-storage/async-storage': asyncStorage, 'react-native': { Platform: { OS: 'android' } }, 'expo-secure-store': { getItemAsync: async key => secure.get(key) ?? null, setItemAsync: async (key, value) => secure.set(key, value), deleteItemAsync: async key => secure.delete(key) } });
  await store.writeSession({ token: 'secret' }); assert.equal(memory.size, 0); assert.equal(secure.size, 1);
  await Promise.all([store.writeSession({ token: 'updated' }), store.writeSession(null)]); assert.equal(await store.readSession(), null);
  await store.writeCache('alice', '/groups', { data: ['alice'] }); assert.equal(await store.readCache('bob', '/groups'), null);
  const version = store.cacheVersion(); await store.clearAccountCaches(); await store.writeCache('alice', '/late-response', {}, version);
  assert.equal(memory.size, 0);
});

test('every protected 401 expires the session even with a non-JSON response', async () => {
  const api = load('lib/api.ts', { 'react-native': { Platform: { OS: 'web' } } }, { fetch: async () => ({ status: 401, ok: false, json: async () => { throw new Error('Not JSON'); } }) });
  let expired = 0; api.configureSession('token', () => expired++);
  await assert.rejects(api.request('/me')); assert.equal(expired, 1);
});

function mutationHarness(request, offline = false) {
  let ids = 0; let invalidations = 0;
  class ApiError extends Error { constructor(status) { super('Request failed'); this.status = status; } }
  const hooks = load('hooks/use-mutation.ts', {
    'react': { useRef: value => ({ current: value }), useState: value => [value, () => undefined] },
    'expo': { uuid: { v4: () => `uuid-${++ids}` } },
    '@/lib/api': { ApiError, request },
    '@/providers/app-provider': { useApp: () => ({ offline, invalidate: () => invalidations++ }) },
  });
  return { ...hooks.useMutation(), ApiError, invalidations: () => invalidations };
}

test('uncertain mutations retry the same key/payload and block changed intentions', async () => {
  const calls = []; let fail = true;
  const hook = mutationHarness(async (path, options) => { calls.push({ path, ...options }); if (fail) throw new Error('Network timeout'); return { data: { id: 'saved' } }; });
  const body = { description: 'Dinner', amountCents: 100 };
  await assert.rejects(hook.mutate('/expenses', 'POST', body, true), /Network timeout/);
  await assert.rejects(hook.mutate('/expenses', 'POST', { ...body, amountCents: 200 }, true), /previous save may have succeeded/);
  await assert.rejects(hook.mutate('/expenses', 'PUT', body, true), /previous save may have succeeded/);
  assert.equal(calls.length, 1); fail = false;
  await hook.mutate('/expenses', 'POST', body, true);
  assert.equal(calls[0].key, calls[1].key); assert.deepEqual(calls[0].body, calls[1].body);
  await hook.mutate('/expenses', 'POST', body, true); assert.notEqual(calls[2].key, calls[1].key);
  assert.equal(hook.invalidations(), 2);
});

test('server uncertainty retains the creation key without invalidating cached data', async () => {
  const keys = []; let fail = true;
  const hook = mutationHarness(async (_path, options) => { keys.push(options.key); if (fail) throw new hook.ApiError(503); return { data: {} }; });
  await assert.rejects(hook.mutate('/payments', 'POST', { amountCents: 25 }, true));
  assert.equal(hook.invalidations(), 0); fail = false;
  await hook.mutate('/payments', 'POST', { amountCents: 25 }, true);
  assert.equal(keys[0], keys[1]); assert.equal(hook.invalidations(), 1);
});

test('offline and duplicate taps never send writes; definite rejection releases the intent', async () => {
  const offline = mutationHarness(async () => { throw new Error('Should not send'); }, true);
  await assert.rejects(offline.mutate('/payments', 'POST', {}, true), /offline/);
  let release; const gate = new Promise(resolve => { release = resolve; }); let sent = 0;
  const hook = mutationHarness(async () => { sent++; await gate; return { data: {} }; });
  const pending = hook.mutate('/payments', 'POST', {}, true);
  await assert.rejects(hook.mutate('/payments', 'POST', {}, true), /save is already in progress/);
  release(); await pending; assert.equal(sent, 1);
  let rejected = true; const keys = [];
  const definite = mutationHarness(async (_path, options) => { keys.push(options.key); if (rejected) throw new definite.ApiError(400); return { data: {} }; });
  await assert.rejects(definite.mutate('/expenses', 'POST', { amountCents: 1 }, true)); rejected = false;
  await definite.mutate('/expenses', 'POST', { amountCents: 2 }, true); assert.notEqual(keys[0], keys[1]);
});

test('JSX never renders empty error strings as native View text', () => {
  const root = path.join(__dirname, '../src');
  function check(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) check(file);
      else if (file.endsWith('.tsx')) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\{(?:\w+\.error|error|subtitle|hint) &&/, file);
    }
  }
  check(root);
});
test('scanned QR data yields a join code only from bare codes or ?code= links', () => {
  const invite = load('lib/invite.ts', { 'expo-linking': { createURL: (path, { queryParams }) => `pennywise:/${path}?code=${queryParams.code}` }, 'react-native': { Share: {} }, '@/lib/api': { errorMessage: String }, '@/lib/format': format });
  assert.equal(invite.inviteLink('K7M2QX'), 'pennywise://join?code=K7M2QX');
  assert.equal(invite.codeFromScan(' k7m2qx '), 'K7M2QX');
  assert.equal(invite.codeFromScan('pennywise://join?code=k7m2qx'), 'K7M2QX');
  assert.equal(invite.codeFromScan('exp://10.0.2.2:8081/--/join?code=K7M2QX&x=1'), 'K7M2QX');
  for (const junk of ['https://example.com', 'pennywise://join?code=I0O1LZ', 'K7M2QXX', '']) assert.equal(invite.codeFromScan(junk), null);
});
