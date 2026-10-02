'use strict';

const request = require('supertest');
const { buildTestApp, registerAndLogin } = require('../helpers');

const CHAOS_TOKEN = 'chaos-token-for-tests-only';

describe('System endpoints', () => {
  const app = buildTestApp({ APP_VERSION: '9.9.9-test', APP_ENV: 'ci' });

  test('GET /health reports status and version', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', version: '9.9.9-test', environment: 'ci' });
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  test('GET /ready reports readiness', async () => {
    await request(app).get('/ready').expect(200, { status: 'ready' });
  });

  test('GET /metrics exposes Prometheus metrics', async () => {
    await request(app).get('/api/does-not-exist');
    const res = await request(app).get('/metrics').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('http_requests_total');
    expect(res.text).toContain('route="unmatched"');
    expect(res.text).toContain('version="9.9.9-test"');
  });

  test('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('unknown routes return JSON 404', async () => {
    const res = await request(app).get('/nope').expect(404);
    expect(res.body.error).toMatch(/not found/);
  });

  test('malformed JSON returns 400', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json').send('{"email":').expect(400);
    expect(res.body.error).toBe('Malformed JSON body');
  });

  test('oversized bodies return 413', async () => {
    await request(app).post('/api/auth/login').send({ email: 'a@b.co', password: 'x'.repeat(20000) }).expect(413);
  });
});

describe('Authentication API', () => {
  const app = buildTestApp();

  test('register -> login -> me', async () => {
    const reg = await request(app).post('/api/auth/register')
      .send({ email: 'Nithin@Example.com', password: 'Password123!' }).expect(201);
    expect(reg.body.user).toEqual({ id: expect.any(String), email: 'nithin@example.com', createdAt: expect.any(String) });

    const login = await request(app).post('/api/auth/login')
      .send({ email: 'nithin@example.com', password: 'Password123!' }).expect(200);
    expect(login.body).toMatchObject({ tokenType: 'Bearer', token: expect.any(String) });

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`).expect(200);
    expect(me.body.user.email).toBe('nithin@example.com');
  });

  test('rejects duplicate and invalid registrations', async () => {
    await request(app).post('/api/auth/register').send({ email: 'dup@example.com', password: 'Password123!' }).expect(201);
    await request(app).post('/api/auth/register').send({ email: 'dup@example.com', password: 'Password123!' }).expect(409);
    const res = await request(app).post('/api/auth/register').send({ email: 'x', password: 'y' }).expect(400);
    expect(res.body.details).toHaveLength(2);
  });

  test('rejects wrong passwords and incomplete logins', async () => {
    await request(app).post('/api/auth/login').send({ email: 'dup@example.com', password: 'WrongPass1!' }).expect(401);
    await request(app).post('/api/auth/login').send({}).expect(400);
  });

  test.each([
    ['no header', undefined],
    ['wrong scheme', 'Basic abc123'],
    ['missing token', 'Bearer'],
    ['invalid token', 'Bearer not-a-token'],
  ])('rejects %s on protected routes', async (_name, header) => {
    const req = request(app).get('/api/auth/me');
    if (header) {
      req.set('Authorization', header);
    }
    await req.expect(401);
  });

  test('rate-limits repeated authentication attempts', async () => {
    const limited = buildTestApp({ AUTH_RATE_LIMIT_MAX: '2' });
    await request(limited).post('/api/auth/login').send({});
    await request(limited).post('/api/auth/login').send({});
    const res = await request(limited).post('/api/auth/login').send({}).expect(429);
    expect(res.body.error).toMatch(/Too many/);
  });
});

describe('Tasks API', () => {
  const app = buildTestApp();
  let alice;
  let bob;
  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

  beforeAll(async () => {
    alice = await registerAndLogin(app, 'alice@example.com');
    bob = await registerAndLogin(app, 'bob@example.com');
  });

  test('requires authentication', async () => {
    await request(app).get('/api/tasks').expect(401);
  });

  test('full CRUD lifecycle', async () => {
    const created = await request(app).post('/api/tasks').set(auth(alice))
      .send({ title: 'Configure Jenkins', priority: 'high', dueDate: '2026-10-20' }).expect(201);
    const { id } = created.body.task;
    expect(created.headers.location).toBe(`/api/tasks/${id}`);

    const fetched = await request(app).get(`/api/tasks/${id}`).set(auth(alice)).expect(200);
    expect(fetched.body.task.title).toBe('Configure Jenkins');

    const patched = await request(app).patch(`/api/tasks/${id}`).set(auth(alice)).send({ status: 'done' }).expect(200);
    expect(patched.body.task.status).toBe('done');

    const list = await request(app).get('/api/tasks?status=done').set(auth(alice)).expect(200);
    expect(list.body.count).toBe(1);

    await request(app).delete(`/api/tasks/${id}`).set(auth(alice)).expect(204);
    await request(app).get(`/api/tasks/${id}`).set(auth(alice)).expect(404);
  });

  test('validates input', async () => {
    const res = await request(app).post('/api/tasks').set(auth(alice)).send({ priority: 'urgent' }).expect(400);
    expect(res.body.details.length).toBeGreaterThan(0);
    await request(app).get('/api/tasks?status=blocked').set(auth(alice)).expect(400);
  });

  test('isolates tasks between users', async () => {
    const created = await request(app).post('/api/tasks').set(auth(alice)).send({ title: 'Secret plan' }).expect(201);
    const { id } = created.body.task;
    await request(app).get(`/api/tasks/${id}`).set(auth(bob)).expect(404);
    await request(app).patch(`/api/tasks/${id}`).set(auth(bob)).send({ title: 'hacked' }).expect(404);
    await request(app).delete(`/api/tasks/${id}`).set(auth(bob)).expect(404);
    const bobList = await request(app).get('/api/tasks').set(auth(bob)).expect(200);
    expect(bobList.body.count).toBe(0);
  });

  test('rejects invalid updates', async () => {
    const created = await request(app).post('/api/tasks').set(auth(alice)).send({ title: 'Patch me' }).expect(201);
    await request(app).patch(`/api/tasks/${created.body.task.id}`).set(auth(alice)).send({}).expect(400);
  });

  test('returns task statistics', async () => {
    const res = await request(app).get('/api/tasks/stats').set(auth(alice)).expect(200);
    expect(res.body.stats).toMatchObject({ total: expect.any(Number), byStatus: expect.any(Object) });
  });
});

describe('Chaos endpoints', () => {
  test('are not mounted unless enabled', async () => {
    await request(buildTestApp()).get('/api/chaos/error').expect(404);
  });

  describe('when enabled', () => {
    const app = buildTestApp({ CHAOS_ENABLED: 'true', CHAOS_TOKEN });

    test('require the chaos token', async () => {
      await request(app).get('/api/chaos/error').expect(401);
      await request(app).get('/api/chaos/error').set('x-chaos-token', 'wrong').expect(401);
    });

    test('inject a 500 error without leaking details', async () => {
      const res = await request(app).get('/api/chaos/error').set('x-chaos-token', CHAOS_TOKEN).expect(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });

    test('inject bounded latency', async () => {
      const res = await request(app).get('/api/chaos/latency?ms=25').set('x-chaos-token', CHAOS_TOKEN).expect(200);
      expect(res.body.delayedMs).toBe(25);
    });

    test('use the default latency for invalid input', async () => {
      const res = await request(app).get('/api/chaos/latency?ms=-5').set('x-chaos-token', CHAOS_TOKEN).expect(200);
      expect(res.body.delayedMs).toBe(1000);
    });
  });
});
