'use strict';

const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { loadConfig } = require('./config');
const { createLogger } = require('./utils/logger');
const { notFound } = require('./utils/errors');
const { createMemoryStore } = require('./store/memoryStore');
const { createMetrics } = require('./metrics');
const { createAuthService } = require('./services/authService');
const { createTaskService } = require('./services/taskService');
const { authenticate } = require('./middleware/authenticate');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');
const { authRouter } = require('./routes/auth');
const { tasksRouter } = require('./routes/tasks');
const { chaosRouter } = require('./routes/chaos');

/** Application factory - dependencies are injected so tests get isolated instances. */
function createApp({ config = loadConfig(), store = createMemoryStore(), logger } = {}) {
  const log = logger || createLogger(config.logLevel);
  const metrics = createMetrics({
    appEnv: config.appEnv,
    version: config.version,
    collectDefault: config.nodeEnv !== 'test',
  });
  const authService = createAuthService({ store, config, metrics });
  const taskService = createTaskService({ store });
  const requireAuth = authenticate(authService);
  const startedAt = Date.now();

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(metrics.middleware);
  app.use(requestLogger(log));
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      version: config.version,
      environment: config.appEnv,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
  });

  app.get('/ready', (req, res) => {
    const ready = store.isHealthy();
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
  });

  app.get('/metrics', async (req, res, next) => {
    try {
      res.set('Content-Type', metrics.registry.contentType);
      res.send(await metrics.registry.metrics());
    } catch (err) {
      next(err);
    }
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.authRateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later' },
  });

  app.use('/api/auth', authLimiter, authRouter({ authService, requireAuth }));
  app.use('/api/tasks', requireAuth, tasksRouter({ taskService, metrics }));
  if (config.chaosEnabled) {
    app.use('/api/chaos', chaosRouter({ chaosToken: config.chaosToken }));
  }

  app.use((req, res, next) => next(notFound(`Route ${req.method} ${req.path} not found`)));
  app.use(errorHandler(log));

  return app;
}

module.exports = { createApp };
