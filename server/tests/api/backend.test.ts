import { randomUUID } from 'node:crypto';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { User, Group, Expense, Settlement, Category, ensureIndexes } from '../../src/models';
import { TOKEN_OPTIONS } from '../../src/middleware/auth';
import { balancesFor } from '../../src/services/ledger';
import { flushNotifications, setPushSender, type PushMessage, type PushTicket } from '../../src/services/notifications';

const secret = 'pennywise-isolated-test-secret-32-characters';
const app = createApp({ jwtSecret: secret, corsOrigins: ['http://localhost:8081'] });
let mongo: MongoMemoryServer;
let alice: { id: string; token: string };
let bob: { id: string; token: string };
let charlie: { id: string; token: string };
let outsider: { id: string; token: string };
let groupId: string;
let code: string;
const auth = (token = alice.token) => `Bearer ${token}`;
const expenseBody = () => ({ description: 'Snacks', amountCents: 100, paidBy: alice.id, splitMode: 'all', categoryId: 'food' });
const paymentBody = () => ({ fromUser: bob.id, toUser: alice.id, amountCents: 20 });
const postExpense = (key = randomUUID(), body: Record<string, unknown> = expenseBody(), token = alice.token) => request(app).post(`/groups/${groupId}/expenses`).set('Authorization', auth(token)).set('Idempotency-Key', key).send(body);
const postPayment = (key = randomUUID(), body = paymentBody(), token = alice.token) => request(app).post(`/groups/${groupId}/settlements`).set('Authorization', auth(token)).set('Idempotency-Key', key).send(body);

beforeAll(async () => {
  // Standalone instance: these tests deliberately do not use a replica set.
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'pennywise_isolated_tests' });
  await ensureIndexes();
  async function account(name: string) {
    const result = await request(app).post('/auth/signup').send({ name, email: `${name.toLowerCase()}@example.com`, password: 'long-password-123' });
    expect(result.status).toBe(201);
    return { id: result.body.data.user.id as string, token: result.body.data.token as string };
  }
  alice = await account('Alice'); bob = await account('Bob'); charlie = await account('Charlie'); outsider = await account('Outsider');
});
beforeEach(async () => {
  await Promise.all([Group.deleteMany({}), Expense.deleteMany({}), Settlement.deleteMany({}), Category.deleteMany({})]);
  const result = await request(app).post('/groups').set('Authorization', auth()).send({ name: 'Weekend trip' });
  expect(result.status).toBe(201);
  groupId = result.body.data.id; code = result.body.data.joinCode;
  for (const user of [bob, charlie]) expect((await request(app).post('/groups/join').set('Authorization', auth(user.token)).send({ code })).status).toBe(200);
});
afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('auth returns safe profiles, normalizes email, and hashes passwords', async () => {
  const result = await request(app).post('/auth/login').send({ email: ' ALICE@EXAMPLE.COM ', password: 'long-password-123' });
  expect(result.status).toBe(200);
  expect(result.body.data.user).not.toHaveProperty('passwordHash');
  const user = await User.findById(alice.id).select('+passwordHash');
  expect(user!.passwordHash).toMatch(/^\$2[ab]\$/);
  const claims = jwt.verify(result.body.data.token, secret) as jwt.JwtPayload;
  expect(claims.exp! - claims.iat!).toBe(7 * 86400);
  expect((await request(app).post('/auth/signup').send({ name: 'Another', email: 'ALICE@example.com', password: 'long-password-123' })).status).toBe(409);
});
test('signup enforces 8 characters and the bcrypt byte limit', async () => {
  for (const password of ['1234567', '🙂'.repeat(19)]) {
    expect((await request(app).post('/auth/signup').send({ name: 'New', email: 'new@example.com', password })).status).toBe(400);
  }
  expect((await request(app).post('/auth/signup').send({ name: 'New', email: 'new@example.com', password: 'abcd1234' })).status).toBe(201);
});
test('invalid credentials produce identical errors', async () => {
  const wrong = await request(app).post('/auth/login').send({ email: 'alice@example.com', password: 'wrong-password' });
  const missing = await request(app).post('/auth/login').send({ email: 'missing@example.com', password: 'wrong-password' });
  expect(wrong.status).toBe(401); expect(missing.body).toEqual(wrong.body);
});
test('login never accepts bcrypt-truncated password suffixes', async () => {
  const password = 'x'.repeat(72);
  const signup = await request(app).post('/auth/signup').send({ name: 'Byte limit', email: 'byte-limit@example.com', password });
  expect(signup.status).toBe(201);
  expect((await request(app).post('/auth/login').send({ email: 'byte-limit@example.com', password: `${password}extra` })).status).toBe(400);
  expect((await request(app).post('/auth/login').send({ email: 'byte-limit@example.com', password })).status).toBe(200);
});
test('missing, invalid, expired, and wrong-audience tokens are rejected', async () => {
  const expired = jwt.sign({}, secret, { ...TOKEN_OPTIONS, subject: alice.id, expiresIn: -1 });
  const wrongAudience = jwt.sign({}, secret, { ...TOKEN_OPTIONS, subject: alice.id, audience: 'other-app' });
  expect((await request(app).get('/me')).status).toBe(401);
  for (const token of ['invalid', expired, wrongAudience]) expect((await request(app).get('/me').set('Authorization', auth(token))).status).toBe(401);
});
test('display name changes without accepting email or password changes', async () => {
  const updated = await request(app).patch('/me').set('Authorization', auth()).send({ name: ' Alice Updated ' });
  expect(updated.body.data.name).toBe('Alice Updated');
  expect((await request(app).patch('/me').set('Authorization', auth()).send({ name: 'Alice', email: 'other@example.com' })).status).toBe(400);
  await request(app).patch('/me').set('Authorization', auth()).send({ name: 'Alice' });
});
test('join code is normalized and repeated parallel joins do not duplicate membership', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => request(app).post('/groups/join').set('Authorization', auth(bob.token)).send({ code: ` ${code.toLowerCase()} ` })));
  expect(results.every(r => r.status === 200)).toBe(true);
  expect((await Group.findById(groupId))!.members).toHaveLength(3);
  const invalid = await request(app).post('/groups/join').set('Authorization', auth()).send({ code: '000000' });
  expect(invalid.status).toBe(404); expect(invalid.body.error.message).toBe('Group not found');
});
test('groups have no capacity field and accept more than sixteen members', async () => {
  const passwordHash = (await User.findById(alice.id).select('+passwordHash'))!.passwordHash;
  for (let i = 0; i < 15; i++) {
    const user = await User.create({ name: `Member ${i}`, email: `large-${i}@example.com`, passwordHash });
    const token = jwt.sign({}, secret, { ...TOKEN_OPTIONS, subject: String(user._id) });
    expect((await request(app).post('/groups/join').set('Authorization', auth(token)).send({ code })).status).toBe(200);
  }
  const group = await Group.findById(groupId).lean();
  expect(group!.members).toHaveLength(18); expect(group).not.toHaveProperty('maxMembers');
  expect((await request(app).post('/groups').set('Authorization', auth()).send({ name: 'Invalid', maxMembers: 16 })).status).toBe(400);
});
test('a user sees only their groups and may own several', async () => {
  await request(app).post('/groups').set('Authorization', auth()).send({ name: 'Second group' });
  await request(app).post('/groups').set('Authorization', auth(outsider.token)).send({ name: 'Private group' });
  const result = await request(app).get('/groups').set('Authorization', auth());
  expect(result.body.pagination.total).toBe(2); expect(result.body.data.some((g: { name: string }) => g.name === 'Private group')).toBe(false);
});
test.each(['', '/members', '/expenses', '/balances', '/settle-up', '/settlements'])('non-members cannot read %s', async suffix => {
  expect((await request(app).get(`/groups/${groupId}${suffix}`).set('Authorization', auth(outsider.token))).status).toBe(403);
});
test.each(['/expenses', '/settlements', '/join-code'])('non-members cannot write %s', async suffix => {
  expect((await request(app).post(`/groups/${groupId}${suffix}`).set('Authorization', auth(outsider.token)).send({})).status).toBe(403);
});
test('only creator can rename/rotate; old code stops working', async () => {
  expect((await request(app).patch(`/groups/${groupId}`).set('Authorization', auth(bob.token)).send({ name: 'No' })).status).toBe(403);
  expect((await request(app).post(`/groups/${groupId}/join-code`).set('Authorization', auth(bob.token))).status).toBe(403);
  expect((await request(app).patch(`/groups/${groupId}`).set('Authorization', auth()).send({ name: 'Renamed' })).body.data.name).toBe('Renamed');
  const rotated = await request(app).post(`/groups/${groupId}/join-code`).set('Authorization', auth());
  expect(rotated.body.data.joinCode).not.toBe(code);
  expect((await request(app).post('/groups/join').set('Authorization', auth(outsider.token)).send({ code })).status).toBe(404);
  expect((await request(app).post('/groups/join').set('Authorization', auth(outsider.token)).send({ code: rotated.body.data.joinCode })).status).toBe(200);
});
test('member search is paginated, literal, and hides email', async () => {
  const result = await request(app).get(`/groups/${groupId}/members?search=ALICE&limit=1`).set('Authorization', auth());
  expect(result.body.pagination.total).toBe(1); expect(result.body.data[0].id).toBe(alice.id);
  expect(result.body.data[0]).not.toHaveProperty('email');
  expect((await request(app).get(`/groups/${groupId}/members?search=.*`).set('Authorization', auth())).body.data).toEqual([]);
  expect((await request(app).get(`/groups/${groupId}/members?limit=101`).set('Authorization', auth())).status).toBe(400);
});
test('only the creator can set, replace, or remove a group photo/preset', async () => {
  const path = `/groups/${groupId}`;
  expect((await request(app).patch(path).set('Authorization', auth()).send({ image: 'preset:heart' })).body.data.image).toBe('preset:heart');
  expect((await request(app).get(path).set('Authorization', auth(charlie.token))).body.data.image).toBe('preset:heart');
  for (const token of [bob.token, charlie.token]) {
    for (const image of ['preset:people', null]) {
      const rejected = await request(app).patch(path).set('Authorization', auth(token)).send({ image });
      expect(rejected.status).toBe(403); expect(rejected.body.error.code).toBe('FORBIDDEN');
    }
  }
  for (const field of [{ name: 'Changed' }, { description: 'Changed' }, { color: 'rose' }, { icon: 'home' }]) {
    expect((await request(app).patch(path).set('Authorization', auth(bob.token)).send({ image: null, ...field })).status).toBe(403);
  }
  expect((await request(app).patch(path).set('Authorization', auth(outsider.token)).send({ image: null })).status).toBe(403);
  expect((await request(app).patch(path).set('Authorization', auth(bob.token)).send({ image: 'https://example.com/photo.jpg' })).status).toBe(403);
  expect((await request(app).get(path).set('Authorization', auth())).body.data).toMatchObject({ image: 'preset:heart', name: 'Weekend trip' });
  expect((await request(app).patch(path).set('Authorization', auth()).send({ image: null })).body.data.image).toBeNull();
});
test('equal splits are server-calculated and all-mode snapshots membership', async () => {
  const result = await postExpense();
  expect(result.status).toBe(201); expect(result.body.data.splits.map((s: { shareCents: number }) => s.shareCents).sort()).toEqual([33, 33, 34]);
  await request(app).post('/groups/join').set('Authorization', auth(outsider.token)).send({ code });
  const list = await request(app).get(`/groups/${groupId}/expenses`).set('Authorization', auth());
  expect(list.body.data[0].splits).toHaveLength(3);
  const selected = await request(app).post(`/groups/${groupId}/expenses`).set('Authorization', auth()).set('Idempotency-Key', randomUUID()).send({ description: 'For Bob', amountCents: 1, paidBy: alice.id, splitMode: 'selected', splitUserIds: [bob.id], categoryId: 'other' });
  expect(selected.status).toBe(201); expect(selected.body.data.splits).toEqual([{ userId: bob.id, shareCents: 1 }]);
});
test.each([0, -1, 1.5, '100', Number.MAX_SAFE_INTEGER + 1])('rejects bad expense amount %s', async amountCents => {
  expect((await postExpense(randomUUID(), { ...expenseBody(), amountCents } as ReturnType<typeof expenseBody>)).status).toBe(400);
});
test('rejects missing keys, non-members in splits, duplicates, and spoofed authors', async () => {
  expect((await request(app).post(`/groups/${groupId}/expenses`).set('Authorization', auth()).send(expenseBody())).status).toBe(400);
  for (const body of [
    { ...expenseBody(), paidBy: outsider.id },
    { ...expenseBody(), splitMode: 'selected', splitUserIds: [outsider.id] },
    { ...expenseBody(), splitMode: 'selected', splitUserIds: [bob.id, bob.id] },
    { ...expenseBody(), createdBy: bob.id },
  ]) expect((await request(app).post(`/groups/${groupId}/expenses`).set('Authorization', auth()).set('Idempotency-Key', randomUUID()).send(body)).status).toBe(400);
});
test('idempotent concurrent creation stores one expense and rejects changed payload', async () => {
  const key = randomUUID();
  const results = await Promise.all(Array.from({ length: 6 }, () => postExpense(key)));
  expect(results.every(r => r.status === 201)).toBe(true);
  expect(results.every(r => JSON.stringify(r.body) === JSON.stringify(results[0]!.body))).toBe(true);
  expect(await Expense.countDocuments({ groupId })).toBe(1);
  expect((await postExpense(key, { ...expenseBody(), amountCents: 200 })).status).toBe(409);
  expect(results[0]!.body.data).not.toHaveProperty('requestKey');
});
test('expense author and group creator can edit; third member cannot', async () => {
  const result = await postExpense(randomUUID(), expenseBody(), bob.token);
  const path = `/groups/${groupId}/expenses/${result.body.data.id}`;
  const edit = { description: 'Corrected', amountCents: 200, paidBy: bob.id };
  expect((await request(app).put(path).set('Authorization', auth(charlie.token)).send(edit)).status).toBe(403);
  expect((await request(app).delete(path).set('Authorization', auth(charlie.token))).status).toBe(403);
  expect((await request(app).put(path).set('Authorization', auth(bob.token)).send(edit)).body.data.splits).toHaveLength(3);
  expect((await request(app).put(path).set('Authorization', auth()).send(edit)).status).toBe(200);
});
test('retry after edit and deletion returns original response without resurrection', async () => {
  const key = randomUUID(); const original = await postExpense(key);
  const path = `/groups/${groupId}/expenses/${original.body.data.id}`;
  await request(app).put(path).set('Authorization', auth()).send({ description: 'Edited', amountCents: 200, paidBy: alice.id });
  expect((await postExpense(key)).body).toEqual(original.body);
  expect((await request(app).delete(path).set('Authorization', auth())).status).toBe(204);
  expect((await request(app).delete(path).set('Authorization', auth())).status).toBe(204);
  expect((await postExpense(key)).body).toEqual(original.body);
  expect((await request(app).get(`/groups/${groupId}/expenses`).set('Authorization', auth())).body.data).toEqual([]);
  expect((await Expense.findById(original.body.data.id))!.deletedAt).not.toBeNull();
});
test('record IDs cannot be used under a different group', async () => {
  const expense = await postExpense();
  const other = await request(app).post('/groups').set('Authorization', auth()).send({ name: 'Other' });
  expect((await request(app).delete(`/groups/${other.body.data.id}/expenses/${expense.body.data.id}`).set('Authorization', auth())).status).toBe(404);
});
test('any member can record partial or excessive payments and correct them', async () => {
  await postExpense();
  const key = randomUUID();
  const original = await postPayment(key, { ...paymentBody(), amountCents: 150 }, charlie.token);
  expect(original.status).toBe(201); expect(original.body.data.createdBy).toBe(charlie.id);
  expect((await postPayment(key, { ...paymentBody(), amountCents: 150 }, charlie.token)).body).toEqual(original.body);
  const path = `/groups/${groupId}/settlements/${original.body.data.id}`;
  const edit = await request(app).put(path).set('Authorization', auth(bob.token)).send(paymentBody());
  expect(edit.status).toBe(200); expect(edit.body.data.updatedBy).toBe(bob.id);
  expect((await request(app).delete(path).set('Authorization', auth())).status).toBe(204);
  expect((await request(app).put(path).set('Authorization', auth()).send(paymentBody())).status).toBe(404);
  expect((await postPayment(key, { ...paymentBody(), amountCents: 150 }, charlie.token)).body).toEqual(original.body);
  const history = await request(app).get(`/groups/${groupId}/settlements`).set('Authorization', auth());
  expect(history.body.data[0].deletedBy).toBe(alice.id); expect(history.body.data[0].deletedAt).not.toBeNull();
  expect((await postPayment(key, paymentBody(), charlie.token)).status).toBe(409);
});
test('settlement concurrency is idempotent; self/non-member payments are rejected', async () => {
  const key = randomUUID();
  const results = await Promise.all(Array.from({ length: 5 }, () => postPayment(key)));
  expect(results.every(r => r.status === 201)).toBe(true); expect(await Settlement.countDocuments({ groupId })).toBe(1);
  expect((await postPayment(randomUUID(), { ...paymentBody(), toUser: bob.id })).status).toBe(400);
  expect((await postPayment(randomUUID(), { ...paymentBody(), toUser: outsider.id })).status).toBe(400);
});
test('balances use the full ledger and recompute after settlement and expense changes', async () => {
  for (let i = 0; i < 10; i++) await postExpense();
  const list = await request(app).get(`/groups/${groupId}/expenses?limit=1`).set('Authorization', auth());
  expect(list.body.data).toHaveLength(1); expect(list.body.pagination.total).toBe(10);
  const before = await request(app).get(`/groups/${groupId}/balances`).set('Authorization', auth());
  expect(before.body.data.reduce((sum: number, b: { balanceCents: number }) => sum + b.balanceCents, 0)).toBe(0);
  const payments = await request(app).get(`/groups/${groupId}/settle-up`).set('Authorization', auth());
  expect(payments.body.data.length).toBeLessThanOrEqual(2);
  for (const payment of payments.body.data) await postPayment(randomUUID(), payment);
  expect((await request(app).get(`/groups/${groupId}/balances`).set('Authorization', auth())).body.data.every((b: { balanceCents: number }) => b.balanceCents === 0)).toBe(true);
  await request(app).delete(`/groups/${groupId}/expenses/${list.body.data[0].id}`).set('Authorization', auth());
  expect((await request(app).get(`/groups/${groupId}/balances`).set('Authorization', auth())).body.data.some((b: { balanceCents: number }) => b.balanceCents !== 0)).toBe(true);
});
test('CORS, JSON errors, invalid IDs and health have consistent responses', async () => {
  expect((await request(app).get('/health')).status).toBe(200);
  expect((await request(app).get('/health').set('Origin', 'http://untrusted.example')).status).toBe(403);
  expect((await request(app).get('/groups/not-an-id').set('Authorization', auth())).status).toBe(400);
  const invalid = await request(app).post('/auth/login').set('Content-Type', 'application/json').send('{');
  expect(invalid.status).toBe(400); expect(invalid.body.error.code).toBe('INVALID_JSON');
});

test('a member joining during a balance request cannot cause an invalid ledger error', async () => {
  const staleGroup = (await Group.findById(groupId).lean())!;
  await request(app).post('/groups/join').set('Authorization', auth(outsider.token)).send({ code });
  expect((await postExpense(randomUUID(), { ...expenseBody(), paidBy: outsider.id }, outsider.token)).status).toBe(201);
  const balances = await balancesFor(staleGroup);
  expect(balances).toHaveLength(4);
  expect(balances.some(b => b.userId === outsider.id)).toBe(true);
  expect(balances.reduce((sum, b) => sum + b.balanceCents, 0)).toBe(0);
});

test('a member joining during a dashboard request is counted without an invalid ledger error', async () => {
  const find = Expense.find.bind(Expense);
  // Simulate the join and expense landing after the dashboard's group read but before its ledger read.
  jest.spyOn(Expense, 'find').mockImplementationOnce(((filter: Record<string, unknown>) => ({ lean: async () => {
    expect((await request(app).post('/groups/join').set('Authorization', auth(outsider.token)).send({ code })).status).toBe(200);
    expect((await postExpense(randomUUID(), { ...expenseBody(), paidBy: outsider.id }, outsider.token)).status).toBe(201);
    return find(filter).lean();
  } })) as unknown as typeof Expense.find);
  const dashboard = await request(app).get('/dashboard').set('Authorization', auth());
  expect(dashboard.status).toBe(200);
  expect(dashboard.body.data.summaries[groupId]).toMatchObject({ expenseCount: 1, spendingCents: 100, balanceCents: -25 });
});

test('simultaneous code rotations cannot both keep the same new code', async () => {
  await Group.updateOne({ _id: groupId }, { $set: { joinCode: 'CCCCCC' } });
  let calls = 0;
  // Both initial attempts generate AAAAAA; a retry generates BBBBBB.
  const random = jest.spyOn(crypto, 'randomInt').mockImplementation(() => calls++ < 12 ? 0 : 1);
  try {
    const results = await Promise.all(Array.from({ length: 2 }, () => request(app).post(`/groups/${groupId}/join-code`).set('Authorization', auth())));
    expect(results.map(r => r.status)).toEqual([200, 200]);
    expect(new Set(results.map(r => r.body.data.joinCode)).size).toBe(2);
    expect((await Group.findById(groupId))!.joinCode).toBe('BBBBBB');
  } finally { random.mockRestore(); }
});

test('valid profile reads are safe and password updates remain outside scope', async () => {
  const profile = await request(app).get('/me').set('Authorization', auth());
  expect(profile.status).toBe(200); expect(profile.body.data.id).toBe(alice.id);
  expect(profile.body.data).not.toHaveProperty('passwordHash');
  expect((await request(app).patch('/me').set('Authorization', auth()).send({ name: 'Alice', password: 'another-password' })).status).toBe(400);
});

test('join code collisions are retried on creation and rotation', async () => {
  await Group.updateOne({ _id: groupId }, { $set: { joinCode: 'AAAAAA' } });
  let calls = 0;
  const random = jest.spyOn(crypto, 'randomInt').mockImplementation(() => calls++ < 6 ? 0 : 1);
  try {
    const created = await request(app).post('/groups').set('Authorization', auth()).send({ name: 'Collision test' });
    expect(created.status).toBe(201); expect(created.body.data.joinCode).toBe('BBBBBB');
    await Group.updateOne({ _id: groupId }, { $set: { joinCode: 'CCCCCC' } });
    calls = 0;
    // AAAAAA is now free; reserve it on the other group to force a collision.
    await Group.updateOne({ _id: created.body.data.id }, { $set: { joinCode: 'AAAAAA' } });
    const rotated = await request(app).post(`/groups/${groupId}/join-code`).set('Authorization', auth());
    expect(rotated.status).toBe(200); expect(rotated.body.data.joinCode).toBe('BBBBBB');
  } finally { random.mockRestore(); }
});

test('exhausted code collisions fail safely rather than creating duplicate groups', async () => {
  await Group.updateOne({ _id: groupId }, { $set: { joinCode: 'AAAAAA' } });
  const random = jest.spyOn(crypto, 'randomInt').mockImplementation(() => 0);
  try {
    const result = await request(app).post('/groups').set('Authorization', auth()).send({ name: 'Collision failure' });
    expect(result.status).toBe(503); expect(result.body.error.code).toBe('CODE_UNAVAILABLE');
    expect(await Group.countDocuments({})).toBe(1);
  } finally { random.mockRestore(); }
});

test.each(['put', 'delete'] as const)('non-members cannot %s expenses or settlements', async method => {
  const expense = await postExpense(); const payment = await postPayment();
  for (const [resource, recordId, body] of [
    ['expenses', expense.body.data.id, { description: 'Edited', amountCents: 100, paidBy: alice.id }],
    ['settlements', payment.body.data.id, paymentBody()],
  ] as const) {
    const result = await request(app)[method](`/groups/${groupId}/${resource}/${recordId}`).set('Authorization', auth(outsider.token)).send(body);
    expect(result.status).toBe(403);
  }
  expect((await request(app).patch(`/groups/${groupId}`).set('Authorization', auth(outsider.token)).send({ name: 'No' })).status).toBe(403);
});

test('cross-group settlement IDs cannot be read through edits or deletions', async () => {
  const payment = await postPayment();
  const other = await request(app).post('/groups').set('Authorization', auth()).send({ name: 'Other group' });
  const path = `/groups/${other.body.data.id}/settlements/${payment.body.data.id}`;
  expect((await request(app).put(path).set('Authorization', auth()).send({ fromUser: alice.id, toUser: outsider.id, amountCents: 10 })).status).toBe(400);
  await request(app).post('/groups/join').set('Authorization', auth(bob.token)).send({ code: other.body.data.joinCode });
  expect((await request(app).put(path).set('Authorization', auth()).send(paymentBody())).status).toBe(404);
  expect((await request(app).delete(path).set('Authorization', auth())).status).toBe(404);
});

test('expense editing switches splits explicitly but preserves participants when omitted', async () => {
  const created = await postExpense(); const path = `/groups/${groupId}/expenses/${created.body.data.id}`;
  const selected = await request(app).put(path).set('Authorization', auth()).send({ description: 'Only Bob', amountCents: 1, paidBy: alice.id, splitMode: 'selected', splitUserIds: [bob.id] });
  expect(selected.status).toBe(200); expect(selected.body.data.splits).toEqual([{ userId: bob.id, shareCents: 1 }]);
  await request(app).post('/groups/join').set('Authorization', auth(outsider.token)).send({ code });
  const preserved = await request(app).put(path).set('Authorization', auth()).send({ description: 'Still Bob', amountCents: 100, paidBy: alice.id });
  expect(preserved.body.data.splits).toEqual([{ userId: bob.id, shareCents: 100 }]);
  const everyone = await request(app).put(path).set('Authorization', auth()).send({ description: 'Everyone', amountCents: 1, paidBy: alice.id, splitMode: 'all' });
  expect(everyone.body.data.splits.map((s: { shareCents: number }) => s.shareCents).sort()).toEqual([0, 0, 0, 1]);
});

test('expense corrections after settlement keep recorded payments and recompute balances', async () => {
  const expense = await postExpense(); const payment = await postPayment();
  const edit = await request(app).put(`/groups/${groupId}/expenses/${expense.body.data.id}`).set('Authorization', auth()).send({ description: 'Corrected after payment', amountCents: 200, paidBy: bob.id });
  expect(edit.status).toBe(200);
  expect((await Settlement.findById(payment.body.data.id))!.amountCents).toBe(20);
  const balances = await request(app).get(`/groups/${groupId}/balances`).set('Authorization', auth());
  expect(balances.body.data.every((b: { name: string }) => typeof b.name === 'string')).toBe(true);
  expect(balances.body.data.reduce((sum: number, b: { balanceCents: number }) => sum + b.balanceCents, 0)).toBe(0);
  const aliceShare = edit.body.data.splits.find((s: { userId: string }) => s.userId === alice.id).shareCents;
  expect(balances.body.data.find((b: { userId: string }) => b.userId === alice.id).balanceCents).toBe(-aliceShare - 20);
});

test('selected expense retries normalize IDs, keys and split order', async () => {
  const key = randomUUID();
  const body = { description: ' Selected ', amountCents: 100, paidBy: alice.id, splitMode: 'selected', splitUserIds: [bob.id, alice.id], categoryId: 'food' };
  const original = await request(app).post(`/groups/${groupId}/expenses`).set('Authorization', auth()).set('Idempotency-Key', key).send(body);
  const replay = await request(app).post(`/groups/${groupId}/expenses`).set('Authorization', auth()).set('Idempotency-Key', key.toUpperCase()).send({ ...body, description: 'Selected', paidBy: alice.id.toUpperCase(), splitUserIds: [alice.id.toUpperCase(), bob.id.toUpperCase()] });
  expect(original.status).toBe(201); expect(replay.body).toEqual(original.body);
  expect(await Expense.countDocuments({ groupId })).toBe(1);
  const anotherAuthor = await request(app).post(`/groups/${groupId}/expenses`).set('Authorization', auth(bob.token)).set('Idempotency-Key', key).send(body);
  expect(anotherAuthor.status).toBe(201); expect(anotherAuthor.body.data.createdBy).toBe(bob.id);
  expect(await Expense.countDocuments({ groupId })).toBe(2);
});

test.each([0, -1, 1.5, '20', Number.MAX_SAFE_INTEGER + 1])('rejects bad settlement amount %s', async amountCents => {
  const result = await request(app).post(`/groups/${groupId}/settlements`).set('Authorization', auth()).set('Idempotency-Key', randomUUID()).send({ ...paymentBody(), amountCents });
  expect(result.status).toBe(400);
});

test('settlement keys and actor/metadata fields cannot be spoofed', async () => {
  expect((await request(app).post(`/groups/${groupId}/settlements`).set('Authorization', auth()).send(paymentBody())).status).toBe(400);
  const original = await postPayment(); const path = `/groups/${groupId}/settlements/${original.body.data.id}`;
  for (const extra of [{ createdBy: bob.id }, { deletedAt: new Date().toISOString() }, { requestHash: 'spoof' }]) {
    expect((await request(app).put(path).set('Authorization', auth()).send({ ...paymentBody(), ...extra })).status).toBe(400);
  }
  expect((await request(app).delete(path).set('Authorization', auth())).status).toBe(204);
  const firstDeletion = (await Settlement.findById(original.body.data.id))!.deletedAt!.toISOString();
  expect((await request(app).delete(path).set('Authorization', auth(bob.token))).status).toBe(204);
  const record = (await Settlement.findById(original.body.data.id))!;
  expect(record.deletedAt!.toISOString()).toBe(firstDeletion); expect(String(record.deletedBy)).toBe(alice.id);
});

test('balance endpoints return 422 instead of rounding aggregate overflow', async () => {
  for (let i = 0; i < 2; i++) {
    const result = await request(app).post(`/groups/${groupId}/expenses`).set('Authorization', auth()).set('Idempotency-Key', randomUUID()).send({ description: 'Large', amountCents: Number.MAX_SAFE_INTEGER, paidBy: alice.id, splitMode: 'selected', splitUserIds: [bob.id], categoryId: 'other' });
    expect(result.status).toBe(201);
  }
  for (const endpoint of ['balances', 'settle-up']) {
    const result = await request(app).get(`/groups/${groupId}/${endpoint}`).set('Authorization', auth());
    expect(result.status).toBe(422); expect(result.body.error.code).toBe('BALANCE_OVERFLOW');
  }
});

test('CORS preflight permits authenticated idempotent mobile-web writes', async () => {
  const result = await request(app).options(`/groups/${groupId}/expenses`).set('Origin', 'http://localhost:8081')
    .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'Authorization,Content-Type,Idempotency-Key');
  expect(result.status).toBe(204); expect(result.headers['access-control-allow-origin']).toBe('http://localhost:8081');
  expect(result.headers['access-control-allow-headers']).toMatch(/Idempotency-Key/i);
});

test('oversized JSON and unsupported charsets are client errors, not internal errors', async () => {
  const oversized = await request(app).post('/auth/login').send({ email: 'alice@example.com', password: 'x'.repeat(1024 * 1024) });
  expect(oversized.status).toBe(413); expect(oversized.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  const charset = await request(app).post('/auth/login').set('Content-Type', 'application/json; charset=iso-8859-1').send('{}');
  expect(charset.status).toBe(415); expect(charset.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
});

test('database indexes enforce unique accounts, codes and creation request keys', async () => {
  const users = await User.collection.indexes(); const groups = await Group.collection.indexes();
  expect(users.some(index => index.key.email === 1 && index.unique)).toBe(true);
  expect(groups.some(index => index.key.joinCode === 1 && index.unique)).toBe(true);
  expect(groups.some(index => index.key.members === 1)).toBe(true);
  for (const collection of [Expense.collection, Settlement.collection]) {
    const indexes = await collection.indexes();
    expect(indexes.some(index => index.key.groupId === 1)).toBe(true);
    expect(indexes.some(index => index.key.groupId === 1 && index.key.createdBy === 1 && index.key.requestKey === 1 && index.unique)).toBe(true);
    expect(indexes.some(index => index.key.groupId === 1 && index.key.createdAt === -1 && index.key._id === -1)).toBe(true);
  }
});

test('group and profile presets are validated and round-trip without email leakage', async () => {
  const metadata = { description: ' A weekend away ', icon: 'airplane', color: 'violet' };
  const changed = await request(app).patch(`/groups/${groupId}`).set('Authorization', auth()).send(metadata);
  expect(changed.status).toBe(200); expect(changed.body.data).toMatchObject({ ...metadata, description: 'A weekend away' });
  expect((await request(app).patch(`/groups/${groupId}`).set('Authorization', auth()).send({ description: 'x'.repeat(201) })).status).toBe(400);
  expect((await request(app).patch(`/groups/${groupId}`).set('Authorization', auth(bob.token)).send({ color: 'rose' })).status).toBe(403);
  expect((await request(app).patch('/me').set('Authorization', auth()).send({ avatar: 'leaf', avatarColor: 'rose' })).body.data).toMatchObject({ avatar: 'leaf', avatarColor: 'rose' });
  expect((await request(app).patch('/me').set('Authorization', auth()).send({ avatar: 'uploaded' })).status).toBe(400);
  await request(app).patch('/me').set('Authorization', auth()).send({ avatar: 'initials', avatarColor: 'emerald' });
});

test('concurrent first joins return one new membership and one atomic join event', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => request(app).post('/groups/join').set('Authorization', auth(outsider.token)).send({ code })));
  expect(results.every(result => result.status === 200)).toBe(true);
  expect(results.filter(result => result.body.alreadyMember === false)).toHaveLength(1);
  expect(results.filter(result => result.body.alreadyMember === true)).toHaveLength(7);
  const history = await request(app).get(`/groups/${groupId}/activity?kind=group`).set('Authorization', auth());
  expect(history.status).toBe(200);
  expect(history.body.data.filter((entry: { action: string; actorId: string }) => entry.action === 'member.joined' && entry.actorId === outsider.id)).toHaveLength(1);
  expect((await Group.findById(groupId))!.members).toHaveLength(4);
});

test('excluded participants are validated, snapshotted, and idempotently normalized', async () => {
  const key = randomUUID(); const body = { ...expenseBody(), splitMode: 'allExcept', excludedUserIds: [alice.id, charlie.id] };
  const original = await postExpense(key, body);
  expect(original.status).toBe(201); expect(original.body.data.splits).toEqual([{ userId: bob.id, shareCents: 100 }]);
  await request(app).post('/groups/join').set('Authorization', auth(outsider.token)).send({ code });
  const replay = await postExpense(key, { ...body, excludedUserIds: [charlie.id.toUpperCase(), alice.id.toUpperCase()] });
  expect(replay.body).toEqual(original.body);
  for (const invalid of [
    { ...body, excludedUserIds: [] }, { ...body, excludedUserIds: [bob.id, bob.id] },
    { ...body, excludedUserIds: [alice.id, bob.id, charlie.id, outsider.id] },
    { ...body, splitMode: 'all' }, { ...body, splitUserIds: [bob.id] },
  ]) expect((await postExpense(randomUUID(), invalid)).status).toBe(400);
  const other = new mongoose.Types.ObjectId().toString();
  expect((await postExpense(randomUUID(), { ...body, excludedUserIds: [other] })).status).toBe(400);
});

test('categories require valid choices, reject duplicates, and restrict archives to creator', async () => {
  const path = `/groups/${groupId}/categories`;
  const list = await request(app).get(`${path}?limit=3&page=2`).set('Authorization', auth());
  expect(list.status).toBe(200); expect(list.body.data).toHaveLength(3); expect(list.body.pagination.total).toBe(10);
  const create = await request(app).post(path).set('Authorization', auth(bob.token)).send({ name: ' Beach gear ', icon: 'bag', color: 'blue' });
  expect(create.status).toBe(201); const categoryId = create.body.data.id;
  expect((await request(app).post(path).set('Authorization', auth()).send({ name: 'beach GEAR' })).status).toBe(409);
  expect((await request(app).post(path).set('Authorization', auth()).send({ name: 'Food & drinks' })).status).toBe(409);
  expect((await request(app).patch(`${path}/${categoryId}`).set('Authorization', auth(bob.token)).send({ archived: true })).status).toBe(403);
  const expense = await postExpense(randomUUID(), { ...expenseBody(), categoryId });
  expect(expense.status).toBe(201); expect(expense.body.data.category.name).toBe('Beach gear');
  await request(app).patch(`${path}/${categoryId}`).set('Authorization', auth()).send({ name: 'Beach things', archived: true });
  expect((await request(app).get(`${path}?search=beach`).set('Authorization', auth())).body.data).toEqual([]);
  expect((await request(app).get(`${path}?search=beach&includeArchived=true`).set('Authorization', auth())).body.data).toHaveLength(1);
  expect((await postExpense(randomUUID(), { ...expenseBody(), categoryId })).status).toBe(400);
  const kept = await request(app).put(`/groups/${groupId}/expenses/${expense.body.data.id}`).set('Authorization', auth()).send({ description: 'Updated gear', amountCents: 200, paidBy: alice.id, categoryId });
  expect(kept.status).toBe(200); expect(kept.body.data.category.name).toBe('Beach gear');
  const { categoryId: _category, ...uncategorized } = expenseBody();
  expect((await request(app).post(`/groups/${groupId}/expenses`).set('Authorization', auth()).set('Idempotency-Key', randomUUID()).send(uncategorized)).status).toBe(400);
  expect((await postExpense(randomUUID(), { ...expenseBody(), categoryId: 'unknown' })).status).toBe(400);
  const other = await request(app).post('/groups').set('Authorization', auth()).send({ name: 'Other' });
  expect((await request(app).post(`/groups/${other.body.data.id}/expenses`).set('Authorization', auth()).set('Idempotency-Key', randomUUID()).send({ ...expenseBody(), categoryId })).status).toBe(400);
  const legacy = await Expense.findById(expense.body.data.id); legacy!.category = null; await legacy!.save();
  expect((await request(app).get(`/groups/${groupId}/expenses/${legacy!._id}`).set('Authorization', auth())).body.data.category).toBeNull();
});

test('activity preserves concurrent before-images and deletion without leaking secrets', async () => {
  const key = randomUUID(); const original = await postExpense(key); const path = `/groups/${groupId}/expenses/${original.body.data.id}`;
  const edits = await Promise.all([200, 300, 400].map(amountCents => request(app).put(path).set('Authorization', auth()).send({ description: 'Corrected', amountCents, paidBy: alice.id })));
  expect(edits.every(result => result.status === 200)).toBe(true);
  await request(app).delete(path).set('Authorization', auth()); await request(app).delete(path).set('Authorization', auth());
  await postExpense(key);
  const history = await request(app).get(`/groups/${groupId}/activity?kind=expenses`).set('Authorization', auth());
  expect(history.status).toBe(200); expect(history.body.pagination.total).toBe(5);
  const chronological = [...history.body.data].reverse();
  expect(chronological.map(entry => entry.action)).toEqual(['expense.created', 'expense.updated', 'expense.updated', 'expense.updated', 'expense.deleted']);
  for (let i = 1; i < chronological.length; i++) expect(chronological[i].before.amountCents).toBe(chronological[i - 1].after.amountCents);
  await request(app).post(`/groups/${groupId}/join-code`).set('Authorization', auth());
  const all = await request(app).get(`/groups/${groupId}/activity`).set('Authorization', auth());
  const json = JSON.stringify(all.body);
  for (const secretValue of [code, key, 'alice@example.com', 'passwordHash', 'joinCode', 'creationResponse']) expect(json).not.toContain(secretValue);
  expect((await request(app).get(`/groups/${groupId}/activity?kind=group&limit=1&page=2`).set('Authorization', auth())).body.data).toHaveLength(1);
});

test('failure to prepare an audit entry cannot persist the associated action', async () => {
  // Fault at the audit actor lookup, including calls inside auditedUpdate.
  const fail = jest.spyOn(User, 'findById').mockImplementation(() => { throw new Error('Audit unavailable'); });
  try {
    expect((await postExpense()).status).toBe(500);
    expect(await Expense.countDocuments({ groupId })).toBe(0);
    expect((await request(app).patch(`/groups/${groupId}`).set('Authorization', auth()).send({ name: 'Not saved' })).status).toBe(500);
    expect((await Group.findById(groupId))!.name).toBe('Weekend trip');
    expect((await request(app).post('/groups/join').set('Authorization', auth(outsider.token)).send({ code })).status).toBe(500);
    expect((await Group.findById(groupId))!.members).toHaveLength(3);
  } finally { fail.mockRestore(); }
});

test('statements use full corrected ledger, original dates, and page opening balances', async () => {
  const first = await postExpense(); const second = await postExpense(); const payment = await postPayment();
  const memberPath = `/groups/${groupId}/statements?view=member&userId=${bob.id}`;
  const full = await request(app).get(memberPath).set('Authorization', auth());
  expect(full.status).toBe(200); expect(full.body.data.rows).toHaveLength(3);
  const balances = await request(app).get(`/groups/${groupId}/balances`).set('Authorization', auth());
  expect(full.body.data.overallBalanceCents).toBe(balances.body.data.find((entry: { userId: string }) => entry.userId === bob.id).balanceCents);
  const page2 = await request(app).get(`${memberPath}&limit=1&page=2`).set('Authorization', auth());
  expect(page2.body.data.openingBalanceCents).toBe(full.body.data.rows[0].balanceCents);
  expect(page2.body.data.rows[0]).toEqual(full.body.data.rows[1]); expect(page2.body.data.overallBalanceCents).toBe(full.body.data.overallBalanceCents);
  expect((await request(app).get(`/groups/${groupId}/statements?view=spending&limit=1`).set('Authorization', auth())).body.data.overallBalanceCents).toBe(200);
  await request(app).put(`/groups/${groupId}/expenses/${first.body.data.id}`).set('Authorization', auth()).send({ description: 'Corrected', amountCents: 300, paidBy: alice.id });
  await request(app).delete(`/groups/${groupId}/expenses/${second.body.data.id}`).set('Authorization', auth());
  const corrected = await request(app).get(`/groups/${groupId}/statements?view=spending`).set('Authorization', auth());
  expect(corrected.body.data.overallBalanceCents).toBe(300); expect(corrected.body.data.rows).toHaveLength(1);
  expect(corrected.body.data.rows[0].createdAt).toBe(first.body.data.createdAt);
  await request(app).delete(`/groups/${groupId}/settlements/${payment.body.data.id}`).set('Authorization', auth());
  const after = await request(app).get(memberPath).set('Authorization', auth());
  expect(after.body.data.rows).toHaveLength(1);
  expect((await request(app).get(`/groups/${groupId}/statements?userId=${outsider.id}`).set('Authorization', auth())).status).toBe(400);
});

test.each(['/categories', '/activity', '/statements'])('new group records are forbidden to outsiders: %s', async suffix => {
  expect((await request(app).get(`/groups/${groupId}${suffix}`).set('Authorization', auth(outsider.token))).status).toBe(403);
});

test('group spending overflow returns 422 without rounded values', async () => {
  for (let i = 0; i < 2; i++) await postExpense(randomUUID(), { ...expenseBody(), amountCents: Number.MAX_SAFE_INTEGER });
  expect((await request(app).get(`/groups/${groupId}/statements?view=spending`).set('Authorization', auth())).status).toBe(422);
});

test('dashboard and global activity isolate membership and name payment participants', async () => {
  await postExpense(); await postPayment();
  await request(app).post('/groups').set('Authorization', auth(outsider.token)).send({ name: 'Private' });
  const dashboard = await request(app).get('/dashboard').set('Authorization', auth());
  expect(dashboard.status).toBe(200); expect(dashboard.body.data.groups).toHaveLength(1);
  expect(dashboard.body.data.summaries[groupId]).toMatchObject({ expenseCount: 1, spendingCents: 100 });
  const balances = await request(app).get(`/groups/${groupId}/balances`).set('Authorization', auth());
  expect(dashboard.body.data.summaries[groupId].balanceCents).toBe(balances.body.data.find((b: { userId: string }) => b.userId === alice.id).balanceCents);
  const feed = await request(app).get('/activity?kind=payments&limit=1').set('Authorization', auth());
  expect(feed.status).toBe(200); expect(feed.body.data[0]).toMatchObject({ fromName: 'Bob', toName: 'Alice', action: 'payment.created' });
  expect((await request(app).get('/activity').set('Authorization', auth(outsider.token))).body.data).toEqual([]);
  expect((await request(app).get('/dashboard')).status).toBe(401);
  expect((await request(app).get('/activity?kind=unknown').set('Authorization', auth())).status).toBe(400);
});

test('custom shares are exact, membership checked and order-normalized on retries', async () => {
  const key = randomUUID(); const body = { ...expenseBody(), splitMode: 'custom', customSplits: [{ userId: alice.id, shareCents: 10 }, { userId: bob.id, shareCents: 90 }] };
  const created = await postExpense(key, body);
  expect(created.status).toBe(201); expect(created.body.data.splits).toEqual(body.customSplits);
  expect((await postExpense(key, { ...body, customSplits: [...body.customSplits].reverse() })).body).toEqual(created.body);
  for (const customSplits of [[{ userId: bob.id, shareCents: 99 }], [{ userId: outsider.id, shareCents: 100 }], [{ userId: bob.id, shareCents: 50 }, { userId: bob.id, shareCents: 50 }], [{ userId: bob.id, shareCents: -1 }]]) {
    expect((await postExpense(randomUUID(), { ...body, customSplits })).status).toBe(400);
  }
});

test('image presets round-trip, can be removed and arbitrary image URLs are rejected', async () => {
  const path = `/groups/${groupId}`;
  expect((await request(app).patch(path).set('Authorization', auth()).send({ image: 'preset:airplane' })).body.data.image).toBe('preset:airplane');
  expect((await request(app).patch(path).set('Authorization', auth(bob.token)).send({ image: null })).status).toBe(403);
  expect((await request(app).patch(path).set('Authorization', auth()).send({ image: null })).body.data.image).toBeNull();
  expect((await request(app).patch('/me').set('Authorization', auth()).send({ image: 'https://example.com/a.jpg' })).status).toBe(400);
  expect((await request(app).patch('/me').set('Authorization', auth()).send({ image: 'preset:heart' })).body.data.image).toBe('preset:heart');
  await request(app).patch('/me').set('Authorization', auth()).send({ image: null });
  expect((await request(app).post('/media/images').send({ image: 'invalid' })).status).toBe(401);
});

test('backend serves Swagger UI and the bearer-auth OpenAPI document', async () => {
  const spec = await request(app).get('/openapi.json');
  expect(spec.status).toBe(200); expect(spec.body.openapi).toBe('3.1.0');
  expect(spec.body.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  expect(spec.body.paths['/groups/{id}/expenses'].post.parameters.some((p: { name: string }) => p.name === 'Idempotency-Key')).toBe(true);
  expect(spec.body.paths['/media/images'].post.security).toEqual([{ bearerAuth: [] }]);
  const docs = await request(app).get('/docs/');
  expect(docs.status).toBe(200); expect(docs.text).toContain('swagger-ui');
});

test('photo uploads are signed server-side and return the provider URL without credentials', async () => {
  const previous = [process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_API_KEY, process.env.CLOUDINARY_API_SECRET];
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud'; process.env.CLOUDINARY_API_KEY = 'test-key'; process.env.CLOUDINARY_API_SECRET = 'test-secret';
  const url = 'https://res.cloudinary.com/test-cloud/image/upload/pennywise/test.jpg';
  const remote = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ secure_url: url, resource_type: 'image' }) } as Response);
  try {
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2G3sAAAAASUVORK5CYII=';
    const uploaded = await request(app).post('/media/images').set('Authorization', auth()).send({ image });
    expect(uploaded.status).toBe(201); expect(uploaded.body).toEqual({ data: { image: url } });
    expect((await request(app).patch('/me').set('Authorization', auth()).send({ image: url })).body.data.image).toBe(url);
    const members = await request(app).get(`/groups/${groupId}/members`).set('Authorization', auth(bob.token));
    expect(members.body.data.find((member: { id: string }) => member.id === alice.id)).toMatchObject({ image: url });
    expect(JSON.stringify(members.body)).not.toContain('alice@example.com');
    const balances = await request(app).get(`/groups/${groupId}/balances`).set('Authorization', auth(bob.token));
    expect(balances.body.data.find((member: { userId: string }) => member.userId === alice.id).image).toBe(url);
    expect((await request(app).post('/media/images').set('Authorization', auth(bob.token)).send({ image })).status).toBe(201);
    expect((await request(app).patch('/me').set('Authorization', auth(bob.token)).send({ image: url })).body.data.image).toBe(url);
    expect((await request(app).patch(`/groups/${groupId}`).set('Authorization', auth(bob.token)).send({ image: url })).status).toBe(403);
    expect((await request(app).get(`/groups/${groupId}`).set('Authorization', auth())).body.data.image).toBeNull();
    expect((await request(app).patch(`/groups/${groupId}`).set('Authorization', auth()).send({ image: url })).body.data.image).toBe(url);
    expect((await request(app).patch(`/groups/${groupId}`).set('Authorization', auth(bob.token)).send({ image: null })).status).toBe(403);
    expect((await request(app).get('/dashboard').set('Authorization', auth(charlie.token))).body.data.groups[0].image).toBe(url);
    expect((await request(app).post('/groups').set('Authorization', auth()).send({ name: 'Photo group', image: url })).body.data.image).toBe(url);
    await request(app).patch('/me').set('Authorization', auth()).send({ image: null });
    const form = remote.mock.calls[0]![1]!.body as FormData;
    const publicId = form.get('public_id'); const timestamp = form.get('timestamp');
    expect(publicId).toEqual(expect.stringContaining(`pennywise/${alice.id}/`));
    expect(form.get('signature')).toBe(crypto.createHash('sha1').update(`public_id=${publicId}&timestamp=${timestamp}test-secret`).digest('hex'));
    expect((await request(app).post('/media/images').set('Authorization', auth()).send({ image: 'data:image/jpeg;base64,aGVsbG8=' })).status).toBe(400);
    delete process.env.CLOUDINARY_API_SECRET;
    expect((await request(app).post('/media/images').set('Authorization', auth()).send({ image })).status).toBe(503);
  } finally {
    remote.mockRestore();
    ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
  }
});

describe('push notifications', () => {
  const device = (user: { id: string }) => `ExponentPushToken[${user.id}]`;
  let sent: PushMessage[];
  let tickets: (message: PushMessage) => PushTicket;
  const register = (user: { id: string; token: string }, token = device(user)) => request(app).put('/me/push-token').set('Authorization', auth(user.token)).send({ token });
  const pushed = async () => { await flushNotifications(); return sent; };
  beforeEach(async () => {
    sent = []; tickets = () => ({ status: 'ok' });
    setPushSender(async messages => { sent.push(...messages); return messages.map(tickets); });
    await User.updateMany({}, { $set: { pushTokens: [], notifications: { expenses: true, payments: true, members: true } } });
    for (const user of [alice, bob, charlie]) expect((await register(user)).status).toBe(204);
  });
  afterAll(() => setPushSender(null));

  test('device tokens are validated, moved to the latest account, and removable', async () => {
    expect((await register(alice, 'not-a-token')).status).toBe(400);
    expect((await request(app).put('/me/push-token').send({ token: device(bob) })).status).toBe(401);
    expect((await register(outsider, device(alice))).status).toBe(204);
    expect((await User.findById(alice.id).select('+pushTokens'))!.pushTokens).not.toContain(device(alice));
    expect((await User.findById(outsider.id).select('+pushTokens'))!.pushTokens).toEqual([device(alice)]);
    expect((await register(outsider, device(alice))).status).toBe(204);
    expect((await User.findById(outsider.id).select('+pushTokens'))!.pushTokens).toEqual([device(alice)]);
    const removed = await request(app).delete('/me/push-token').set('Authorization', auth(outsider.token)).send({ token: device(alice) });
    expect(removed.status).toBe(204);
    expect((await User.findById(outsider.id).select('+pushTokens'))!.pushTokens).toEqual([]);
    const profile = await request(app).get('/me').set('Authorization', auth());
    expect(profile.body.data).not.toHaveProperty('pushTokens');
  });
  test('notification preferences default on, merge per type, and reject empty updates', async () => {
    const fresh = await request(app).get('/me').set('Authorization', auth(outsider.token));
    expect(fresh.body.data.notifications).toEqual({ expenses: true, payments: true, members: true });
    const patch = (body: object) => request(app).patch('/me/notifications').set('Authorization', auth(bob.token)).send(body);
    expect((await patch({ payments: false })).body.data.notifications).toEqual({ expenses: true, payments: false, members: true });
    expect((await patch({ members: false })).body.data.notifications).toEqual({ expenses: true, payments: false, members: false });
    expect((await patch({})).status).toBe(400);
    expect((await patch({ expenses: 'no' })).status).toBe(400);
    expect((await patch({ unknown: true })).status).toBe(400);
  });
  test('a new expense notifies other participants once, honours their mute setting, and not on replay', async () => {
    await request(app).patch('/me/notifications').set('Authorization', auth(charlie.token)).send({ expenses: false });
    const key = randomUUID();
    const body = { description: 'Dinner', amountCents: 30000, paidBy: alice.id, splitMode: 'all', categoryId: 'food' };
    expect((await postExpense(key, body)).status).toBe(201);
    const messages = await pushed();
    expect(messages.map(m => m.to)).toEqual([device(bob)]);
    expect(messages[0]).toMatchObject({ title: 'Alice added “Dinner”', body: 'Weekend trip · Your share: ₹100', data: { type: 'expense', groupId } });
    expect((await postExpense(key, body)).status).toBe(201);
    expect(await pushed()).toHaveLength(1);
  });
  test('payer and removed members hear about edits and deletes; the actor never does', async () => {
    const created = await postExpense(randomUUID(), { description: 'Taxi', amountCents: 9000, paidBy: bob.id, splitMode: 'all', categoryId: 'food' }, bob.token);
    await flushNotifications(); sent.length = 0;
    const eid = created.body.data.id;
    const edit = await request(app).put(`/groups/${groupId}/expenses/${eid}`).set('Authorization', auth(bob.token))
      .send({ description: 'Taxi', amountCents: 9000, paidBy: bob.id, splitMode: 'selected', splitUserIds: [bob.id, alice.id] });
    expect(edit.status).toBe(200);
    const byUser = new Map((await pushed()).map(m => [m.to, m]));
    expect([...byUser.keys()].sort()).toEqual([device(alice), device(charlie)].sort());
    expect(byUser.get(device(alice))!.title).toBe('Bob edited “Taxi”');
    expect(byUser.get(device(alice))!.body).toBe('Weekend trip · Your share: ₹45');
    expect(byUser.get(device(charlie))!.body).toBe('Weekend trip · You were removed from this expense');
    sent.length = 0;
    expect((await request(app).delete(`/groups/${groupId}/expenses/${eid}`).set('Authorization', auth(bob.token))).status).toBe(204);
    const afterDelete = await pushed();
    expect(afterDelete.map(m => m.to).sort()).toEqual([device(alice)]);
    expect(afterDelete[0]!.title).toBe('Bob deleted “Taxi”');
    sent.length = 0;
    expect((await request(app).delete(`/groups/${groupId}/expenses/${eid}`).set('Authorization', auth(bob.token))).status).toBe(204);
    expect(await pushed()).toHaveLength(0);
  });
  test('payments notify only the other party and respect the payments setting', async () => {
    const payment = await postPayment(randomUUID(), { fromUser: bob.id, toUser: alice.id, amountCents: 2550 }, bob.token);
    expect(payment.status).toBe(201);
    let messages = await pushed();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ to: device(alice), title: 'Bob paid you ₹25.50', body: 'Weekend trip', data: { type: 'payment', groupId } });
    sent.length = 0;
    const recorded = await postPayment(randomUUID(), { fromUser: bob.id, toUser: charlie.id, amountCents: 1000 }, alice.token);
    expect(recorded.status).toBe(201);
    messages = await pushed();
    expect(messages.map(m => m.to).sort()).toEqual([device(bob), device(charlie)].sort());
    expect(messages.find(m => m.to === device(bob))!.title).toBe('Alice recorded your ₹10 payment to Charlie');
    sent.length = 0;
    await request(app).patch('/me/notifications').set('Authorization', auth(alice.token)).send({ payments: false });
    await postPayment(randomUUID(), { fromUser: bob.id, toUser: alice.id, amountCents: 100 }, bob.token);
    expect(await pushed()).toHaveLength(0);
    const edit = await request(app).put(`/groups/${groupId}/settlements/${payment.body.data.id}`).set('Authorization', auth(alice.token)).send({ fromUser: bob.id, toUser: alice.id, amountCents: 3000 });
    expect(edit.status).toBe(200);
    expect((await pushed()).map(m => [m.to, m.title])).toEqual([[device(bob), 'Alice updated a ₹30 payment']]);
  });
  test('joining a group notifies existing members but not the joiner or a repeat join', async () => {
    await register(outsider);
    expect((await request(app).post('/groups/join').set('Authorization', auth(outsider.token)).send({ code })).status).toBe(200);
    const messages = await pushed();
    expect(messages.map(m => m.to).sort()).toEqual([device(alice), device(bob), device(charlie)].sort());
    expect(messages[0]).toMatchObject({ title: 'Outsider joined Weekend trip', body: '4 members', data: { type: 'member', groupId } });
    sent.length = 0;
    expect((await request(app).post('/groups/join').set('Authorization', auth(outsider.token)).send({ code })).body.alreadyMember).toBe(true);
    expect(await pushed()).toHaveLength(0);
  });
  test('tokens reported as unregistered are pruned, and a failing push service never fails the request', async () => {
    tickets = message => message.to === device(bob) ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' };
    expect((await postExpense()).status).toBe(201);
    await flushNotifications();
    expect((await User.findById(bob.id).select('+pushTokens'))!.pushTokens).toEqual([]);
    expect((await User.findById(charlie.id).select('+pushTokens'))!.pushTokens).toEqual([device(charlie)]);
    const failure = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    setPushSender(async () => { throw new Error('Expo is down'); });
    expect((await postExpense()).status).toBe(201);
    await flushNotifications();
    expect(failure).toHaveBeenCalledWith('Push notification failed:', 'Expo is down');
    failure.mockRestore();
  });
});
