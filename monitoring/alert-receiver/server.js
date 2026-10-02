'use strict';

/**
 * Team alert channel: receives Alertmanager + Jenkins notifications, logs them,
 * keeps a history (GET /) and optionally forwards them to Slack.
 */
const http = require('node:http');

const PORT = Number(process.env.PORT || 5001);
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
const MAX_BODY = 1024 * 1024;
const history = [];

function summarise(source, payload) {
  if (source === 'alertmanager') {
    return (payload.alerts || []).map((a) => {
      const icon = a.status === 'firing' ? 'FIRING' : 'RESOLVED';
      return `[${icon}] ${a.labels.alertname} (${a.labels.severity || 'n/a'}) ${a.labels.job || ''} - ${(a.annotations || {}).summary || ''}`;
    });
  }
  return [`[JENKINS ${payload.status}] ${payload.job} #${payload.build}: ${payload.message || ''} ${payload.url || ''}`];
}

async function forward(lines) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: lines.join('\n') }),
    });
  } catch (err) {
    console.error(`forwarding failed: ${err.message}`);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{"status":"ok"}');
  }
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(history, null, 2));
  }
  const source = { '/alertmanager': 'alertmanager', '/jenkins': 'jenkins' }[req.url];
  if (req.method !== 'POST' || !source) {
    res.writeHead(404);
    return res.end();
  }
  try {
    const payload = JSON.parse(await readBody(req));
    const lines = summarise(source, payload);
    const receivedAt = new Date().toISOString();
    for (const line of lines) {
      console.log(`${receivedAt} ${line}`);
      history.unshift({ receivedAt, source, line });
    }
    history.splice(100);
    await forward(lines);
    res.writeHead(200);
    return res.end('ok');
  } catch (err) {
    res.writeHead(400);
    return res.end(err.message);
  }
});

server.listen(PORT, () => console.log(`alert-receiver listening on :${PORT}${SLACK_WEBHOOK_URL ? ' (forwarding to Slack)' : ''}`));
