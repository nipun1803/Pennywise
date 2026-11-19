import { randomUUID } from 'node:crypto';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { User, Group, Expense, Settlement, ensureIndexes } from '../../src/models';
import { TOKEN_OPTIONS } from '../../src/middleware/auth';
import { balancesFor } from '../../src/services/ledger';

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
const expenseBody = () => ({ description: 'Snacks', amountCents: 100, paidBy: alice.id, splitMode: 'all' });
const paymentBody = () => ({ fromUser: bob.id, toUser: alice.id, amountCents: 20 });
const postExpense = (key = randomUUID(), body = expenseBody(), token = alice.token) => request(app).post(`/groups/${groupId}/expenses`).set('Authorization', auth(token)).set('Idempotency-Key', key).send(body);
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
  await Promise.all([Group.deleteMany({}), Expense.deleteMany({}), Settlement.deleteMany({})]);
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
test('signup enforces 10 characters and the bcrypt byte limit', async () => {
  for (const password of ['123456789', '🙂'.repeat(19)]) {
    expect((await request(app).post('/auth/signup').send({ name: 'New', email: 'new@example.com', password })).status).toBe(400);
  }
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
test('equal splits are server-calculated and all-mode snapshots membership', async () => {
  const result = await postExpense();
  expect(result.status).toBe(201); expect(result.body.data.splits.map((s: { shareCents: number }) => s.shareCents).sort()).toEqual([33, 33, 34]);
  await request(app).post('/groups/join').set('Authorization', auth(outsider.token)).send({ code });
  const list = await request(app).get(`/groups/${groupId}/expenses`).set('Authorization', auth());
  expect(list.body.data[0].splits).toHaveLength(3);
  const selected = await request(app).post(`/groups/${groupId}/expenses`).set('Authorization', auth()).set('Idempotency-Key', randomUUID()).send({ description: 'For Bob', amountCents: 1, paidBy: alice.id, splitMode: 'selected', splitUserIds: [bob.id] });
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
  const body = { description: ' Selected ', amountCents: 100, paidBy: alice.id, splitMode: 'selected', splitUserIds: [bob.id, alice.id] };
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
    const result = await request(app).post(`/groups/${groupId}/expenses`).set('Authorization', auth()).set('Idempotency-Key', randomUUID()).send({ description: 'Large', amountCents: Number.MAX_SAFE_INTEGER, paidBy: alice.id, splitMode: 'selected', splitUserIds: [bob.id] });
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
