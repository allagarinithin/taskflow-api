'use strict';

const { createTaskService } = require('../../src/services/taskService');
const { createMemoryStore } = require('../../src/store/memoryStore');
const { AppError } = require('../../src/utils/errors');

const FIXED_NOW = new Date('2026-01-15T10:00:00.000Z');

function setup() {
  return createTaskService({ store: createMemoryStore(), now: () => FIXED_NOW });
}

describe('taskService.create', () => {
  test('applies defaults and trims the title', () => {
    const service = setup();
    const task = service.create('u1', { title: '  Write tests  ' });
    expect(task).toEqual({
      id: '1',
      title: 'Write tests',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      createdAt: FIXED_NOW.toISOString(),
      updatedAt: FIXED_NOW.toISOString(),
    });
    expect(task.userId).toBeUndefined();
  });

  test('rejects invalid input with details', () => {
    const service = setup();
    expect(() => service.create('u1', { priority: 'urgent' })).toThrow(AppError);
    try {
      service.create('u1', {});
    } catch (err) {
      expect(err.statusCode).toBe(400);
      expect(err.details).toHaveLength(1);
    }
  });
});

describe('taskService.list', () => {
  let service;
  beforeEach(() => {
    service = setup();
    service.create('u1', { title: 'A', priority: 'low', dueDate: '2026-03-01' });
    service.create('u1', { title: 'B', priority: 'high', status: 'done' });
    service.create('u1', { title: 'C', priority: 'medium', dueDate: '2026-02-01' });
    service.create('u2', { title: 'Other user' });
  });

  test('returns only the owner tasks in creation order', () => {
    expect(service.list('u1').map((t) => t.title)).toEqual(['A', 'B', 'C']);
  });

  test('filters by status and priority', () => {
    expect(service.list('u1', { status: 'done' }).map((t) => t.title)).toEqual(['B']);
    expect(service.list('u1', { priority: 'low' }).map((t) => t.title)).toEqual(['A']);
  });

  test('sorts by priority and by due date (undated last)', () => {
    expect(service.list('u1', { sort: 'priority' }).map((t) => t.title)).toEqual(['B', 'C', 'A']);
    expect(service.list('u1', { sort: 'dueDate' }).map((t) => t.title)).toEqual(['C', 'A', 'B']);
  });

  test('keeps a stable order for equal due dates', () => {
    service.create('u1', { title: 'D' });
    expect(service.list('u1', { sort: 'dueDate' }).map((t) => t.title)).toEqual(['C', 'A', 'B', 'D']);
  });

  test('rejects unknown filter values', () => {
    expect(() => service.list('u1', { status: 'blocked' })).toThrow('Invalid status filter');
    expect(() => service.list('u1', { priority: 'urgent' })).toThrow('Invalid priority filter');
  });
});

describe('taskService get/update/remove', () => {
  test('enforces ownership', () => {
    const service = setup();
    const task = service.create('u1', { title: 'Private' });
    expect(() => service.get('u2', task.id)).toThrow('Task not found');
    expect(() => service.update('u2', task.id, { status: 'done' })).toThrow('Task not found');
    expect(() => service.remove('u2', task.id)).toThrow('Task not found');
  });

  test('updates only whitelisted fields', () => {
    const service = setup();
    const task = service.create('u1', { title: 'Old' });
    const updated = service.update('u1', task.id, { title: ' New ', status: 'done', userId: 'attacker' });
    expect(updated).toMatchObject({ title: 'New', status: 'done' });
    expect(service.get('u1', task.id).title).toBe('New');
    expect(() => service.get('attacker', task.id)).toThrow('Task not found');
  });

  test('rejects invalid updates', () => {
    const service = setup();
    const task = service.create('u1', { title: 'Task' });
    expect(() => service.update('u1', task.id, {})).toThrow('Invalid task update');
  });

  test('updates without a title keep the existing title', () => {
    const service = setup();
    const task = service.create('u1', { title: 'Keep me' });
    expect(service.update('u1', task.id, { priority: 'high' }).title).toBe('Keep me');
  });

  test('removes tasks', () => {
    const service = setup();
    const task = service.create('u1', { title: 'Gone' });
    service.remove('u1', task.id);
    expect(() => service.get('u1', task.id)).toThrow('Task not found');
  });
});

describe('taskService.stats', () => {
  test('returns zeros for a user with no tasks', () => {
    expect(setup().stats('nobody')).toEqual({
      total: 0, byStatus: { todo: 0, in_progress: 0, done: 0 }, overdue: 0, completionRate: 0,
    });
  });

  test('counts statuses, overdue tasks and completion rate', () => {
    const service = setup();
    service.create('u1', { title: 'Late', dueDate: '2026-01-01' });
    service.create('u1', { title: 'Late but done', dueDate: '2026-01-01', status: 'done' });
    service.create('u1', { title: 'Future', dueDate: '2026-12-01', status: 'in_progress' });
    service.create('u1', { title: 'Done', status: 'done' });
    expect(service.stats('u1')).toEqual({
      total: 4, byStatus: { todo: 1, in_progress: 1, done: 2 }, overdue: 1, completionRate: 50,
    });
  });
});
