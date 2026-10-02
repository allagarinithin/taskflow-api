'use strict';

const client = require('prom-client');

const UNTRACKED_PATHS = new Set(['/metrics', '/health', '/ready']);

/**
 * Prometheus instrumentation: RED metrics (rate, errors, duration) per route,
 * business metrics, build info and (outside tests) Node.js process metrics.
 */
function createMetrics({ appEnv, version, collectDefault = true }) {
  const registry = new client.Registry();
  registry.setDefaultLabels({ app: 'taskflow-api', env: appEnv });
  if (collectDefault) {
    client.collectDefaultMetrics({ register: registry });
  }

  const labelNames = ['method', 'route', 'status'];
  const httpRequests = new client.Counter({
    name: 'http_requests_total', help: 'Total HTTP requests', labelNames, registers: [registry],
  });
  const httpDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency in seconds',
    labelNames,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });
  const tasksCreated = new client.Counter({
    name: 'taskflow_tasks_created_total', help: 'Tasks created', registers: [registry],
  });
  const authFailures = new client.Counter({
    name: 'taskflow_auth_failures_total', help: 'Failed authentication attempts', labelNames: ['reason'], registers: [registry],
  });
  const appInfo = new client.Gauge({
    name: 'taskflow_app_info', help: 'Build information for the running release', labelNames: ['version'], registers: [registry],
  });
  appInfo.set({ version }, 1);

  function middleware(req, res, next) {
    if (UNTRACKED_PATHS.has(req.path)) {
      return next();
    }
    const stopTimer = httpDuration.startTimer();
    res.on('finish', () => {
      const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
      const labels = { method: req.method, route, status: String(res.statusCode) };
      stopTimer(labels);
      httpRequests.inc(labels);
    });
    return next();
  }

  return { registry, middleware, tasksCreated, authFailures };
}

module.exports = { createMetrics };
