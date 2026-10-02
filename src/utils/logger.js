'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/** Minimal structured (JSON-lines) logger - easy to ship to any log platform. */
function createLogger(level = 'info', stream = process.stdout) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const write = (lvl) => (msg, fields = {}) => {
    if (LEVELS[lvl] < threshold) {
      return;
    }
    stream.write(`${JSON.stringify({ time: new Date().toISOString(), level: lvl, msg, ...fields })}\n`);
  };
  return { debug: write('debug'), info: write('info'), warn: write('warn'), error: write('error') };
}

module.exports = { createLogger, LEVELS };
