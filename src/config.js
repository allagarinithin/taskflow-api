'use strict';

const crypto = require('node:crypto');
const pkg = require('../package.json');

const MIN_SECRET_LENGTH = 32;
const MIN_CHAOS_TOKEN_LENGTH = 16;

const PROFILE_DEFAULTS = {
  test: { bcryptRounds: 4, logLevel: 'silent', authRateLimitMax: 1000 },
  standard: { bcryptRounds: 10, logLevel: 'info', authRateLimitMax: 20 },
};

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function assertProductionSafety(env, nodeEnv) {
  const secret = env.JWT_SECRET || '';
  if (nodeEnv === 'production' && secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be set (min ${MIN_SECRET_LENGTH} characters) when NODE_ENV=production`);
  }
}

function assertChaosSafety(chaosEnabled, chaosToken) {
  if (chaosEnabled && chaosToken.length < MIN_CHAOS_TOKEN_LENGTH) {
    throw new Error(`CHAOS_TOKEN (min ${MIN_CHAOS_TOKEN_LENGTH} characters) is required when CHAOS_ENABLED=true`);
  }
}

/**
 * Builds the runtime configuration from environment variables.
 * Fails fast on unsafe production settings so a misconfigured release
 * never becomes healthy (the deploy script then rolls it back).
 */
function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const defaults = nodeEnv === 'test' ? PROFILE_DEFAULTS.test : PROFILE_DEFAULTS.standard;
  const read = (key, fallback) => env[key] || fallback;

  assertProductionSafety(env, nodeEnv);
  const chaosEnabled = env.CHAOS_ENABLED === 'true';
  const chaosToken = read('CHAOS_TOKEN', '');
  assertChaosSafety(chaosEnabled, chaosToken);

  return Object.freeze({
    nodeEnv,
    appEnv: read('APP_ENV', nodeEnv),
    port: toInt(env.PORT, 3000),
    version: read('APP_VERSION', pkg.version),
    // Outside production a random per-process secret is used, so no secret is ever hard-coded.
    jwtSecret: env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
    jwtExpiresIn: read('JWT_EXPIRES_IN', '1h'),
    bcryptRounds: toInt(env.BCRYPT_ROUNDS, defaults.bcryptRounds),
    logLevel: read('LOG_LEVEL', defaults.logLevel),
    authRateLimitMax: toInt(env.AUTH_RATE_LIMIT_MAX, defaults.authRateLimitMax),
    chaosEnabled,
    chaosToken,
  });
}

module.exports = { loadConfig, MIN_SECRET_LENGTH, MIN_CHAOS_TOKEN_LENGTH };
