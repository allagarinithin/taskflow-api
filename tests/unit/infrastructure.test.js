'use strict';

const { createLogger } = require('../../src/utils/logger');
const { errorHandler } = require('../../src/middleware/errorHandler');
const { createMetrics } = require('../../src/metrics');
const { AppError } = require('../../src/utils/errors');

function fakeRes() {
  const res = { statusCode: 200 };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn(() => res);
  return res;
}

describe('logger', () => {
  test('writes JSON lines at or above the configured level', () => {
    const stream = { write: jest.fn() };
    const logger = createLogger('warn', stream);
    logger.info('ignored');
    logger.error('boom', { code: 1 });
    expect(stream.write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(stream.write.mock.calls[0][0])).toMatchObject({ level: 'error', msg: 'boom', code: 1 });
  });

  test('falls back to info for unknown levels', () => {
    const stream = { write: jest.fn() };
    const logger = createLogger('verbose', stream);
    logger.debug('hidden');
    logger.info('shown');
    expect(stream.write).toHaveBeenCalledTimes(1);
  });
});

describe('errorHandler', () => {
  const logger = { error: jest.fn() };
  const req = { method: 'GET', path: '/x' };

  test('hides internal details of unexpected errors', () => {
    const res = fakeRes();
    errorHandler(logger)(new Error('db password leaked?'), req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    expect(logger.error).toHaveBeenCalled();
  });

  test('returns client errors with details', () => {
    const res = fakeRes();
    errorHandler(logger)(new AppError(400, 'Invalid task', ['title required']), req, res, () => {});
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid task', details: ['title required'] });
  });
});

describe('metrics', () => {
  test('collects Node.js process metrics when enabled', async () => {
    const metrics = createMetrics({ appEnv: 'unit', version: '0.0.1', collectDefault: true });
    const output = await metrics.registry.metrics();
    expect(output).toContain('process_cpu_user_seconds_total');
    expect(output).toContain('taskflow_app_info');
  });
});
