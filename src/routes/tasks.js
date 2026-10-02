'use strict';

const express = require('express');

function tasksRouter({ taskService, metrics }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const tasks = taskService.list(req.user.id, req.query);
    res.json({ count: tasks.length, tasks });
  });

  router.get('/stats', (req, res) => {
    res.json({ stats: taskService.stats(req.user.id) });
  });

  router.post('/', (req, res) => {
    const task = taskService.create(req.user.id, req.body);
    metrics.tasksCreated.inc();
    res.status(201).location(`/api/tasks/${task.id}`).json({ task });
  });

  router.get('/:id', (req, res) => {
    res.json({ task: taskService.get(req.user.id, req.params.id) });
  });

  router.patch('/:id', (req, res) => {
    res.json({ task: taskService.update(req.user.id, req.params.id, req.body) });
  });

  router.delete('/:id', (req, res) => {
    taskService.remove(req.user.id, req.params.id);
    res.status(204).end();
  });

  return router;
}

module.exports = { tasksRouter };
