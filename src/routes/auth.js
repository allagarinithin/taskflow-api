'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');

function authRouter({ authService, requireAuth }) {
  const router = express.Router();

  router.post('/register', asyncHandler(async (req, res) => {
    const user = await authService.register(req.body);
    res.status(201).json({ user });
  }));

  router.post('/login', asyncHandler(async (req, res) => {
    res.json(await authService.login(req.body));
  }));

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}

module.exports = { authRouter };
