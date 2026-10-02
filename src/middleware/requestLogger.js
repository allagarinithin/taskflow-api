'use strict';

const QUIET_PATHS = new Set(['/health', '/ready', '/metrics']);

/** Logs one structured line per request (method, path, status, duration). */
function requestLogger(logger) {
  return (req, res, next) => {
    if (QUIET_PATHS.has(req.path)) {
      return next();
    }
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      logger.info('request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    });
    return next();
  };
}

module.exports = { requestLogger };
