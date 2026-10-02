'use strict';

/**
 * In-memory persistence layer. Services depend only on this interface,
 * so it can be swapped for a database-backed store without touching routes.
 */
function createMemoryStore() {
  const counters = {};
  return {
    users: new Map(),
    usersByEmail: new Map(),
    tasks: new Map(),
    nextId(kind) {
      counters[kind] = (counters[kind] || 0) + 1;
      return String(counters[kind]);
    },
    isHealthy() {
      return true;
    },
  };
}

module.exports = { createMemoryStore };
