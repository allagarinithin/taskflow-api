'use strict';

/** Forwards rejected promises from async route handlers to Express error handling. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { asyncHandler };
