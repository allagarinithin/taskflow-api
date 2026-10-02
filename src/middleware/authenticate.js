'use strict';

const { unauthorized } = require('../utils/errors');

/** Requires a valid "Authorization: Bearer <JWT>" header and attaches req.user. */
function authenticate(authService) {
  return (req, res, next) => {
    const [scheme, token] = (req.get('authorization') || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      return next(unauthorized());
    }
    try {
      req.user = authService.verifyToken(token);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { authenticate };
