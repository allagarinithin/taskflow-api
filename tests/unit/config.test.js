'use strict';

const { loadConfig } = require('../../src/config');
const pkg = require('../../package.json');

const SECRET = 's'.repeat(32);

describe('loadConfig', () => {
  test('uses safe development defaults', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      nodeEnv: 'development', appEnv: 'development', port: 3000, version: pkg.version, chaosEnabled: false, bcryptRounds: 10,
    });
    expect(config.jwtSecret).toHaveLength(64);
  });

  test('generates a different secret per process when none is supplied', () => {
    expect(loadConfig({}).jwtSecret).not.toEqual(loadConfig({}).jwtSecret);
  });

  test('uses fast settings in test', () => {
    expect(loadConfig({ NODE_ENV: 'test' })).toMatchObject({ bcryptRounds: 4, logLevel: 'silent', authRateLimitMax: 1000 });
  });

  test('reads explicit values from the environment', () => {
    const config = loadConfig({
      PORT: '8080', APP_ENV: 'staging', APP_VERSION: '1.2.3-4-abc', AUTH_RATE_LIMIT_MAX: '50', BCRYPT_ROUNDS: '8',
    });
    expect(config).toMatchObject({
      port: 8080, appEnv: 'staging', version: '1.2.3-4-abc', authRateLimitMax: 50, bcryptRounds: 8,
    });
  });

  test('falls back when numbers are invalid', () => {
    expect(loadConfig({ PORT: 'abc' }).port).toBe(3000);
  });

  test('refuses to start in production without a strong JWT secret', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET/);
  });

  test('starts in production with a strong secret', () => {
    expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: SECRET }).jwtSecret).toBe(SECRET);
  });

  test('requires a strong chaos token when chaos is enabled', () => {
    expect(() => loadConfig({ CHAOS_ENABLED: 'true' })).toThrow(/CHAOS_TOKEN/);
    expect(loadConfig({ CHAOS_ENABLED: 'true', CHAOS_TOKEN: 't'.repeat(16) }).chaosEnabled).toBe(true);
  });
});
