'use strict';

const {
  TASK_STATUSES, TASK_PRIORITIES, validateTaskInput, pickTaskFields,
} = require('../validation');
const { badRequest, notFound } = require('../utils/errors');

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const SORT_KEYS = ['createdAt', 'priority', 'dueDate'];

const toPublicTask = ({ userId, ...task }) => task;

function compareDueDate(a, b) {
  if (a.dueDate === b.dueDate) {
    return 0;
  }
  if (!a.dueDate) {
    return 1;
  }
  if (!b.dueDate) {
    return -1;
  }
  return Date.parse(a.dueDate) - Date.parse(b.dueDate);
}

const COMPARATORS = {
  createdAt: (a, b) => a.createdAt.localeCompare(b.createdAt) || Number(a.id) - Number(b.id),
  priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || Number(a.id) - Number(b.id),
  dueDate: (a, b) => compareDueDate(a, b) || Number(a.id) - Number(b.id),
};

function assertFilter(value, allowed, name) {
  if (value !== undefined && !allowed.includes(value)) {
    throw badRequest(`Invalid ${name} filter`, [`${name} must be one of: ${allowed.join(', ')}`]);
  }
}

function createTaskService({ store, now = () => new Date() }) {
  function getOwned(userId, id) {
    const task = store.tasks.get(String(id));
    if (!task || task.userId !== userId) {
      throw notFound('Task not found');
    }
    return task;
  }

  function create(userId, body) {
    const errors = validateTaskInput(body);
    if (errors.length > 0) {
      throw badRequest('Invalid task', errors);
    }
    const timestamp = now().toISOString();
    const task = {
      id: store.nextId('task'),
      userId,
      title: body.title.trim(),
      description: body.description ?? '',
      status: body.status ?? 'todo',
      priority: body.priority ?? 'medium',
      dueDate: body.dueDate ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    store.tasks.set(task.id, task);
    return toPublicTask(task);
  }

  function listOwned(userId, query = {}) {
    assertFilter(query.status, TASK_STATUSES, 'status');
    assertFilter(query.priority, TASK_PRIORITIES, 'priority');
    const sortKey = SORT_KEYS.includes(query.sort) ? query.sort : 'createdAt';
    return [...store.tasks.values()]
      .filter((task) => task.userId === userId)
      .filter((task) => !query.status || task.status === query.status)
      .filter((task) => !query.priority || task.priority === query.priority)
      .sort(COMPARATORS[sortKey]);
  }

  const list = (userId, query) => listOwned(userId, query).map(toPublicTask);
  const get = (userId, id) => toPublicTask(getOwned(userId, id));

  function update(userId, id, body) {
    const task = getOwned(userId, id);
    const errors = validateTaskInput(body, { partial: true });
    if (errors.length > 0) {
      throw badRequest('Invalid task update', errors);
    }
    const changes = pickTaskFields(body);
    if (typeof changes.title === 'string') {
      changes.title = changes.title.trim();
    }
    const updated = { ...task, ...changes, updatedAt: now().toISOString() };
    store.tasks.set(task.id, updated);
    return toPublicTask(updated);
  }

  function remove(userId, id) {
    const task = getOwned(userId, id);
    store.tasks.delete(task.id);
  }

  function stats(userId) {
    const tasks = listOwned(userId);
    const byStatus = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0]));
    const nowMs = now().getTime();
    let overdue = 0;
    for (const task of tasks) {
      byStatus[task.status] += 1;
      if (task.dueDate && task.status !== 'done' && Date.parse(task.dueDate) < nowMs) {
        overdue += 1;
      }
    }
    const total = tasks.length;
    return {
      total,
      byStatus,
      overdue,
      completionRate: total === 0 ? 0 : Math.round((byStatus.done / total) * 100),
    };
  }

  return { create, list, get, update, remove, stats };
}

module.exports = { createTaskService };
