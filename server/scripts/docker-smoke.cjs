const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { once } = require('node:events');
const { promisify } = require('node:util');
const path = require('node:path');
const { MongoMemoryServer } = require('mongodb-memory-server');

const exec = promisify(execFile);
const directory = path.resolve(__dirname, '..');
const name = `pennywise-smoke-${randomUUID()}`;
const image = 'pennywise-api:local';
let mongo;
let container;
let exited;

async function docker(args, env = process.env) {
  return exec('docker', args, { cwd: directory, env, timeout: 60000 });
}

async function main() {
  await docker(['info', '--format', '{{.ServerVersion}}']);
  // Temporary standalone database, never MONGODB_URI from the user's .env.
  // Bind for Docker's host gateway. Run only on a trusted development network.
  mongo = await MongoMemoryServer.create({ instance: { ip: '0.0.0.0', dbName: 'pennywise_docker_smoke' } });
  const databaseUri = new URL(mongo.getUri());
  databaseUri.hostname = 'host.docker.internal';
  const env = {
    ...process.env, NODE_ENV: 'production', PORT: '3000',
    MONGODB_URI: databaseUri.toString(),
    JWT_SECRET: randomBytes(32).toString('hex'), CORS_ORIGINS: 'http://localhost:8081',
  };
  await docker(['compose', '-f', 'compose.yaml', 'config', '--quiet'], env);
  container = spawn('docker', [
    'run', '--rm', '--init', '--name', name, '-p', '127.0.0.1::3000',
    '--add-host', 'host.docker.internal:host-gateway',
    '-e', 'NODE_ENV', '-e', 'PORT', '-e', 'MONGODB_URI', '-e', 'JWT_SECRET', '-e', 'CORS_ORIGINS', image,
  ], { cwd: directory, env });
  exited = once(container, 'exit');
  // Event-based readiness: do not poll or assume the database/indexes are ready.
  await new Promise((resolve, reject) => {
    let logs = '';
    const timeout = setTimeout(() => reject(new Error(`Container startup timed out: ${logs}`)), 30000);
    const capture = chunk => {
      logs = (logs + chunk.toString()).slice(-4000);
      if (logs.includes('Pennywise API listening')) { clearTimeout(timeout); resolve(); }
    };
    container.stdout.on('data', capture);
    container.stderr.on('data', capture);
    container.once('error', error => { clearTimeout(timeout); reject(error); });
    container.once('exit', code => { clearTimeout(timeout); reject(new Error(`Container exited (${code}): ${logs}`)); });
  });
  const published = (await docker(['port', name, '3000/tcp'])).stdout.trim();
  const base = `http://${published}`;
  const seen = new Set();
  let groupId; let expenseId; let settlementId; let categoryId;
  async function api(method, route, body, token, key, expected = 200) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (key) headers['Idempotency-Key'] = key;
    const response = await fetch(`${base}${route}`, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, expected, `${method} ${route}`);
    let pattern = route.split('?')[0];
    for (const [value, replacement] of [[groupId, ':id'], [expenseId, ':eid'], [settlementId, ':sid'], [categoryId, ':cid']]) {
      if (value) pattern = pattern.replaceAll(value, replacement);
    }
    seen.add(`${method} ${pattern}`);
    return response.status === 204 ? null : response.json();
  }
  assert.equal((await api('GET', '/health')).data.status, 'ok');
  async function account(person) {
    return (await api('POST', '/auth/signup', { name: person, email: `${person.toLowerCase()}@example.com`, password: 'docker-test-passphrase' }, undefined, undefined, 201)).data;
  }
  const alice = await account('Alice'); const bob = await account('Bob'); const outsider = await account('Outsider');
  await api('POST', '/auth/login', { email: 'alice@example.com', password: 'docker-test-passphrase' });
  assert.equal((await api('GET', '/me', undefined, alice.token)).data.id, alice.user.id);
  await api('PATCH', '/me', { name: 'Alice Updated' }, alice.token);
  const group = (await api('POST', '/groups', { name: 'Docker smoke' }, alice.token, undefined, 201)).data;
  groupId = group.id;
  await api('GET', '/groups', undefined, alice.token);
  await api('POST', '/groups/join', { code: group.joinCode }, bob.token);
  await api('GET', `/groups/${groupId}`, undefined, outsider.token, undefined, 403);
  await api('GET', `/groups/${groupId}`, undefined, alice.token);
  assert.equal((await api('GET', `/groups/${groupId}/members?search=ALICE`, undefined, alice.token)).data.length, 1);
  await api('PATCH', `/groups/${groupId}`, { name: 'Renamed Docker group' }, alice.token);
  assert.equal((await api('GET', `/groups/${groupId}/categories`, undefined, alice.token)).pagination.total, 10);
  categoryId = (await api('POST', `/groups/${groupId}/categories`, { name: 'Supplies', icon: 'bag', color: 'blue' }, bob.token, undefined, 201)).data.id;
  await api('PATCH', `/groups/${groupId}/categories/${categoryId}`, { archived: true }, alice.token);
  const key = randomUUID();
  const expense = { description: 'Dinner', amountCents: 100, paidBy: alice.user.id, splitMode: 'all', categoryId: 'food' };
  const original = await api('POST', `/groups/${groupId}/expenses`, expense, alice.token, key, 201);
  expenseId = original.data.id;
  assert.equal((await api('GET', `/groups/${groupId}/expenses/${expenseId}`, undefined, alice.token)).data.category.id, 'food');
  assert.deepEqual(await api('POST', `/groups/${groupId}/expenses`, expense, alice.token, key, 201), original);
  await api('GET', `/groups/${groupId}/expenses?page=1&limit=1`, undefined, alice.token);
  await api('PUT', `/groups/${groupId}/expenses/${expenseId}`, { description: 'Corrected dinner', amountCents: 200, paidBy: alice.user.id }, alice.token);
  assert.equal((await api('GET', `/groups/${groupId}/statements?view=spending`, undefined, alice.token)).data.overallBalanceCents, 200);
  const balances = (await api('GET', `/groups/${groupId}/balances`, undefined, bob.token)).data;
  assert.equal(balances.reduce((sum, b) => sum + b.balanceCents, 0), 0);
  assert.equal((await api('GET', `/groups/${groupId}/settle-up`, undefined, bob.token)).data.length, 1);
  const payment = { fromUser: bob.user.id, toUser: alice.user.id, amountCents: 20 };
  settlementId = (await api('POST', `/groups/${groupId}/settlements`, payment, alice.token, randomUUID(), 201)).data.id;
  await api('PUT', `/groups/${groupId}/settlements/${settlementId}`, { ...payment, amountCents: 300 }, bob.token);
  await api('DELETE', `/groups/${groupId}/settlements/${settlementId}`, undefined, bob.token, undefined, 204);
  assert.ok((await api('GET', `/groups/${groupId}/settlements`, undefined, alice.token)).data[0].deletedAt);
  await api('DELETE', `/groups/${groupId}/expenses/${expenseId}`, undefined, alice.token, undefined, 204);
  assert.deepEqual(await api('POST', `/groups/${groupId}/expenses`, expense, alice.token, key, 201), original);
  assert.equal((await api('GET', `/groups/${groupId}/expenses`, undefined, alice.token)).data.length, 0);
  assert.ok((await api('GET', `/groups/${groupId}/activity?kind=expenses`, undefined, alice.token)).data.some(event => event.action === 'expense.deleted'));
  const code = (await api('POST', `/groups/${groupId}/join-code`, undefined, alice.token)).data.joinCode;
  await api('POST', '/groups/join', { code: group.joinCode }, outsider.token, undefined, 404);
  await api('POST', '/groups/join', { code }, outsider.token);
  assert.equal(seen.size, 28, 'Every implemented endpoint must be exercised');

  const inspection = JSON.parse((await docker(['inspect', name])).stdout)[0];
  assert.equal(inspection.Config.User, 'node');
  const healthCommand = inspection.Config.Healthcheck.Test[1];
  await docker(['exec', name, 'sh', '-c', healthCommand]);
  await docker(['exec', name, 'node', '-e', "const fs=require('node:fs'); if(fs.existsSync('.env') || fs.existsSync('tests') || fs.existsSync('node_modules/typescript') || fs.existsSync('node_modules/mongodb-memory-server')) process.exit(1)"]);
  console.log('Docker smoke passed: all 28 endpoints, permissions, retries, categories, activity, statements, non-root runtime, healthcheck, and production-only files.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (container) {
    try { await docker(['stop', '-t', '15', name]); await exited; }
    catch { try { await docker(['rm', '-f', name]); } catch { /* Own --rm container may already be gone. */ } }
  }
  if (mongo) await mongo.stop();
});
