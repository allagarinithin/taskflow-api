'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { AppError, unauthorized } = require('../utils/errors');
const { asyncHandler } = require('../utils/asyncHandler');

const MAX_LATENCY_MS = 5000;
const DEFAULT_LATENCY_MS = 1000;

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Fault-injection endpoints used by the pipeline's incident simulation.
 * Only mounted when CHAOS_ENABLED=true and protected by a secret token.
 */
function chaosRouter({ chaosToken }) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!safeEqual(req.get('x-chaos-token') || '', chaosToken)) {
      return next(unauthorized('Invalid chaos token'));
    }
    return next();
  });

  router.get('/error', (req, res, next) => {
    next(new AppError(500, 'Simulated failure (chaos experiment)'));
  });

  router.get('/latency', asyncHandler(async (req, res) => {
    const requested = Number.parseInt(req.query.ms, 10);
    const delayMs = requested > 0 ? Math.min(requested, MAX_LATENCY_MS) : DEFAULT_LATENCY_MS;
    await new Promise((resolve) => { setTimeout(resolve, delayMs); });
    res.json({ delayedMs: delayMs });
  }));

  return router;
}

module.exports = { chaosRouter };
