'use strict';

const {
  isValidEmail, validateCredentials, validateTaskInput, pickTaskFields,
} = require('../../src/validation');

describe('isValidEmail', () => {
  test.each([
    ['user@example.com', true],
    ['first.last@sub.domain.org', true],
    ['', false],
    ['no-at-sign.com', false],
    ['@example.com', false],
    ['a@@example.com', false],
    ['a@b@example.com', false],
    ['user@example', false],
    ['user@example.', false],
    ['user@.com', false],
    ['us er@example.com', false],
    [42, false],
    [`${'a'.repeat(250)}@example.com`, false],
  ])('%p -> %p', (email, expected) => {
    expect(isValidEmail(email)).toBe(expected);
  });
});

describe('validateCredentials', () => {
  test('accepts valid credentials', () => {
    expect(validateCredentials({ email: 'a@b.co', password: 'longenough' })).toEqual([]);
  });

  test('reports every problem', () => {
    expect(validateCredentials({ email: 'bad', password: 'short' })).toHaveLength(2);
  });

  test('handles missing or non-object bodies', () => {
    expect(validateCredentials(undefined)).toHaveLength(2);
    expect(validateCredentials(['a'])).toHaveLength(2);
  });

  test('rejects overly long passwords', () => {
    expect(validateCredentials({ email: 'a@b.co', password: 'x'.repeat(129) })).toHaveLength(1);
  });
});

describe('validateTaskInput', () => {
  test('accepts a complete valid task', () => {
    expect(validateTaskInput({
      title: 'Write report', description: 'HD', status: 'in_progress', priority: 'high', dueDate: '2026-10-30',
    })).toEqual([]);
  });

  test('requires a title on create', () => {
    expect(validateTaskInput({})).toEqual(['title is required and must be 1-200 characters']);
  });

  test('rejects blank and oversized titles', () => {
    expect(validateTaskInput({ title: '   ' })).toHaveLength(1);
    expect(validateTaskInput({ title: 'x'.repeat(201) })).toHaveLength(1);
  });

  test('rejects invalid optional fields', () => {
    const errors = validateTaskInput({
      title: 'ok', description: 5, status: 'blocked', priority: 'urgent', dueDate: 'not-a-date',
    });
    expect(errors).toHaveLength(4);
  });

  test('allows dueDate to be cleared with null', () => {
    expect(validateTaskInput({ dueDate: null }, { partial: true })).toEqual([]);
  });

  test('partial updates need at least one field', () => {
    expect(validateTaskInput({}, { partial: true })).toHaveLength(1);
    expect(validateTaskInput(null, { partial: true })).toHaveLength(1);
  });

  test('partial updates validate only supplied fields', () => {
    expect(validateTaskInput({ status: 'done' }, { partial: true })).toEqual([]);
  });
});

describe('pickTaskFields', () => {
  test('whitelists updatable fields only', () => {
    expect(pickTaskFields({ title: 't', userId: 'evil', id: '99', status: 'done' }))
      .toEqual({ title: 't', status: 'done' });
  });
});
