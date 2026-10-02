'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validateCredentials } = require('../validation');
const { badRequest, unauthorized, conflict } = require('../utils/errors');

const publicUser = ({ id, email, createdAt }) => ({ id, email, createdAt });

function createAuthService({ store, config, metrics }) {
  const recordFailure = (reason) => metrics?.authFailures.inc({ reason });

  async function register(body) {
    const errors = validateCredentials(body);
    if (errors.length > 0) {
      throw badRequest('Invalid registration details', errors);
    }
    const email = body.email.toLowerCase();
    if (store.usersByEmail.has(email)) {
      throw conflict('Email is already registered');
    }
    const passwordHash = await bcrypt.hash(body.password, config.bcryptRounds);
    const user = { id: store.nextId('user'), email, passwordHash, createdAt: new Date().toISOString() };
    store.users.set(user.id, user);
    store.usersByEmail.set(email, user.id);
    return publicUser(user);
  }

  async function login(body) {
    const { email, password } = body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw badRequest('email and password are required');
    }
    const user = store.users.get(store.usersByEmail.get(email.toLowerCase()));
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!valid) {
      recordFailure('bad_credentials');
      throw unauthorized('Invalid email or password');
    }
    const token = jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: config.jwtExpiresIn,
    });
    return { token, tokenType: 'Bearer', expiresIn: config.jwtExpiresIn, user: publicUser(user) };
  }

  function verifyToken(token) {
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    } catch {
      recordFailure('invalid_token');
      throw unauthorized('Invalid or expired token');
    }
    const user = store.users.get(payload.sub);
    if (!user) {
      recordFailure('unknown_user');
      throw unauthorized('Invalid or expired token');
    }
    return publicUser(user);
  }

  return { register, login, verifyToken };
}

module.exports = { createAuthService };
