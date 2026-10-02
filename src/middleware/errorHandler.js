'use strict';

/** Converts errors into consistent JSON responses; never leaks internals on 5xx. */
function errorHandler(logger) {
  return (err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON body' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large' });
    }
    const status = err.statusCode || 500;
    if (status >= 500) {
      logger.error('request failed', { error: err.message, method: req.method, path: req.path });
    }
    const body = { error: status >= 500 ? 'Internal server error' : err.message };
    if (err.details) {
      body.details = err.details;
    }
    return res.status(status).json(body);
  };
}

module.exports = { errorHandler };
