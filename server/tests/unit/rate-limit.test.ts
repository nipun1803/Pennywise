import request from 'supertest';
import { createApp } from '../../src/app';

const secret = 'pennywise-isolated-test-secret-32-characters';
const limits = { windowMs: 60_000, globalMax: 8, authMax: 2, joinMax: 2 };
const limited = () => createApp({ jwtSecret: secret, corsOrigins: [], rateLimits: limits });

test('signup and login share one per-IP budget and then return 429', async () => {
  const app = limited();
  expect((await request(app).post('/auth/login').send({})).status).toBe(400);
  expect((await request(app).post('/auth/signup').send({})).status).toBe(400);
  const blocked = await request(app).post('/auth/login').send({});
  expect(blocked.status).toBe(429);
  expect(blocked.body).toEqual({ error: { code: 'AUTH_RATE_LIMITED', message: expect.any(String) } });
  expect(blocked.headers.ratelimit).toBeDefined();
});

test('the global limit applies to every route except /health', async () => {
  const app = limited();
  for (let i = 0; i < limits.globalMax; i++) expect((await request(app).get('/nothing')).status).toBe(401);
  const blocked = await request(app).get('/nothing');
  expect(blocked.status).toBe(429);
  expect(blocked.body.error.code).toBe('RATE_LIMITED');
  expect([200, 503]).toContain((await request(app).get('/health')).status);
});

test('limits are off unless configured, so ordinary tests are not throttled', async () => {
  const app = createApp({ jwtSecret: secret, corsOrigins: [] });
  for (let i = 0; i < 30; i++) expect((await request(app).post('/auth/login').send({})).status).toBe(400);
});
