'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');

function buildTestApp(env = {}) {
  return createApp({ config: loadConfig({ NODE_ENV: 'test', ...env }) });
}

async function registerAndLogin(app, email, password = 'Password123!') {
  await request(app).post('/api/auth/register').send({ email, password }).expect(201);
  const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return { token: res.body.token, user: res.body.user };
}

module.exports = { buildTestApp, registerAndLogin };
