'use strict';

const { createApp } = require('./app');
const { loadConfig } = require('./config');
const { createLogger } = require('./utils/logger');

const config = loadConfig();
const logger = createLogger(config.logLevel);
const app = createApp({ config, logger });

const server = app.listen(config.port, () => {
  logger.info('TaskFlow API started', { port: config.port, version: config.version, environment: config.appEnv });
});

function shutdown(signal) {
  logger.info('Shutting down gracefully', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
