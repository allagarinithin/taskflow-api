'use strict';

const TASK_STATUSES = ['todo', 'in_progress', 'done'];
const TASK_PRIORITIES = ['low', 'medium', 'high'];
const UPDATABLE_FIELDS = ['title', 'description', 'status', 'priority', 'dueDate'];

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Linear-time email check (avoids regexes that are vulnerable to ReDoS). */
function isValidEmail(email) {
  if (typeof email !== 'string' || email.length > 254 || /\s/.test(email)) {
    return false;
  }
  const at = email.indexOf('@');
  if (at < 1 || at !== email.lastIndexOf('@')) {
    return false;
  }
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

function validateCredentials(body) {
  const { email, password } = isPlainObject(body) ? body : {};
  const errors = [];
  if (!isValidEmail(email)) {
    errors.push('email must be a valid email address');
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    errors.push('password must be 8-128 characters');
  }
  return errors;
}

const FIELD_VALIDATORS = {
  title: (v) => (typeof v === 'string' && v.trim().length > 0 && v.length <= 200
    ? null : 'title is required and must be 1-200 characters'),
  description: (v) => (typeof v === 'string' && v.length <= 2000
    ? null : 'description must be a string of at most 2000 characters'),
  status: (v) => (TASK_STATUSES.includes(v) ? null : `status must be one of: ${TASK_STATUSES.join(', ')}`),
  priority: (v) => (TASK_PRIORITIES.includes(v) ? null : `priority must be one of: ${TASK_PRIORITIES.join(', ')}`),
  dueDate: (v) => (v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v)))
    ? null : 'dueDate must be an ISO-8601 date string or null'),
};

function collectFieldErrors(input) {
  return UPDATABLE_FIELDS
    .filter((field) => input[field] !== undefined)
    .map((field) => FIELD_VALIDATORS[field](input[field]))
    .filter(Boolean);
}

/**
 * Validates a task payload. With partial=true (PATCH) only supplied fields are
 * checked, but at least one updatable field must be present.
 */
function validateTaskInput(body, options = {}) {
  const input = isPlainObject(body) ? body : {};
  const errors = collectFieldErrors(input);
  if (options.partial === true) {
    if (Object.keys(pickTaskFields(input)).length === 0) {
      errors.push(`at least one of ${UPDATABLE_FIELDS.join(', ')} must be provided`);
    }
  } else if (input.title === undefined) {
    errors.unshift(FIELD_VALIDATORS.title(undefined));
  }
  return errors;
}

/** Whitelists updatable fields so clients cannot overwrite id/userId/timestamps. */
function pickTaskFields(body) {
  return Object.fromEntries(
    UPDATABLE_FIELDS.filter((field) => body[field] !== undefined).map((field) => [field, body[field]]),
  );
}

module.exports = {
  TASK_STATUSES,
  TASK_PRIORITIES,
  UPDATABLE_FIELDS,
  isValidEmail,
  validateCredentials,
  validateTaskInput,
  pickTaskFields,
};
