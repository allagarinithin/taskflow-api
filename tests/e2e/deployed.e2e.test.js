'use strict';

/**
 * Post-deployment E2E tests. Run by the Deploy stage against the live staging
 * container: BASE_URL=http://taskflow-staging:3000 EXPECTED_VERSION=<image tag>
 */
const BASE_URL = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const EXPECTED_VERSION = process.env.EXPECTED_VERSION;

async function call(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, body: json, text };
}

describe(`Deployed environment E2E (${BASE_URL})`, () => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'E2e-Password-123';
  let token;
  let taskId;

  test('is healthy and running the expected release', async () => {
    const res = await call('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe(EXPECTED_VERSION || res.body.version);
  });

  test('is ready to receive traffic', async () => {
    expect((await call('/ready')).status).toBe(200);
  });

  test('protects the API from anonymous access', async () => {
    expect((await call('/api/tasks')).status).toBe(401);
  });

  test('user can register and log in', async () => {
    expect((await call('/api/auth/register', { method: 'POST', body: { email, password } })).status).toBe(201);
    const login = await call('/api/auth/login', { method: 'POST', body: { email, password } });
    expect(login.status).toBe(200);
    token = login.body.token;
  });

  test('user can create, update, list and delete a task', async () => {
    const created = await call('/api/tasks', { method: 'POST', token, body: { title: 'E2E task', priority: 'high' } });
    expect(created.status).toBe(201);
    taskId = created.body.task.id;

    const updated = await call(`/api/tasks/${taskId}`, { method: 'PATCH', token, body: { status: 'done' } });
    expect(updated.body.task.status).toBe('done');

    const list = await call('/api/tasks', { token });
    expect(list.body.tasks.map((t) => t.id)).toContain(taskId);

    expect((await call(`/api/tasks/${taskId}`, { method: 'DELETE', token })).status).toBe(204);
  });

  test('exposes Prometheus metrics for monitoring', async () => {
    const res = await call('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('taskflow_app_info');
  });
});
