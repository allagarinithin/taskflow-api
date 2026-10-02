'use strict';

const jwt = require('jsonwebtoken');
const { createAuthService } = require('../../src/services/authService');
const { createMemoryStore } = require('../../src/store/memoryStore');
const { loadConfig } = require('../../src/config');

function setup() {
  const store = createMemoryStore();
  const config = loadConfig({ NODE_ENV: 'test' });
  const metrics = { authFailures: { inc: jest.fn() } };
  return { store, config, metrics, auth: createAuthService({ store, config, metrics }) };
}

describe('authService', () => {
  test('registers users with a hashed password and normalised email', async () => {
    const { auth, store } = setup();
    const user = await auth.register({ email: 'Alice@Example.com', password: 'Password123!' });
    expect(user).toEqual({ id: '1', email: 'alice@example.com', createdAt: expect.any(String) });
    expect(store.users.get('1').passwordHash).not.toContain('Password123!');
  });

  test('rejects duplicate and invalid registrations', async () => {
    const { auth } = setup();
    await auth.register({ email: 'a@b.co', password: 'Password123!' });
    await expect(auth.register({ email: 'A@B.CO', password: 'Password123!' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(auth.register({ email: 'bad', password: 'x' })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('logs in and issues a verifiable HS256 token', async () => {
    const { auth, config } = setup();
    await auth.register({ email: 'a@b.co', password: 'Password123!' });
    const result = await auth.login({ email: 'a@b.co', password: 'Password123!' });
    expect(result.tokenType).toBe('Bearer');
    expect(jwt.verify(result.token, config.jwtSecret).sub).toBe('1');
    expect(auth.verifyToken(result.token).email).toBe('a@b.co');
  });

  test('rejects bad credentials and records the failure metric', async () => {
    const { auth, metrics } = setup();
    await auth.register({ email: 'a@b.co', password: 'Password123!' });
    await expect(auth.login({ email: 'a@b.co', password: 'WrongPass1!' })).rejects.toMatchObject({ statusCode: 401 });
    await expect(auth.login({ email: 'nobody@b.co', password: 'Password123!' })).rejects.toMatchObject({ statusCode: 401 });
    expect(metrics.authFailures.inc).toHaveBeenCalledWith({ reason: 'bad_credentials' });
  });

  test('requires email and password on login', async () => {
    const { auth } = setup();
    await expect(auth.login({})).rejects.toMatchObject({ statusCode: 400 });
    await expect(auth.login(undefined)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('rejects tampered tokens and tokens for unknown users', () => {
    const { auth, config, metrics } = setup();
    expect(() => auth.verifyToken('not.a.jwt')).toThrow('Invalid or expired token');
    const ghost = jwt.sign({ sub: '999' }, config.jwtSecret, { algorithm: 'HS256' });
    expect(() => auth.verifyToken(ghost)).toThrow('Invalid or expired token');
    expect(metrics.authFailures.inc).toHaveBeenCalledWith({ reason: 'invalid_token' });
    expect(metrics.authFailures.inc).toHaveBeenCalledWith({ reason: 'unknown_user' });
  });

  test('works without a metrics collector', async () => {
    const store = createMemoryStore();
    const auth = createAuthService({ store, config: loadConfig({ NODE_ENV: 'test' }) });
    expect(() => auth.verifyToken('bad')).toThrow('Invalid or expired token');
  });
});
