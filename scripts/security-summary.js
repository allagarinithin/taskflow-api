#!/usr/bin/env node
'use strict';

/**
 * Combines npm audit + Trivy (filesystem and image) results into one triaged
 * Markdown report: reports/security/security-summary.md
 */
const fs = require('node:fs');
const path = require('node:path');

const dir = process.argv[2] || 'reports/security';
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  } catch {
    return null;
  }
};

const accepted = new Set(
  (fs.existsSync('.trivyignore') ? fs.readFileSync('.trivyignore', 'utf8') : '')
    .split('\n').map((line) => line.split('#')[0].trim()).filter(Boolean),
);

const normalise = (sev) => {
  const upper = String(sev || 'UNKNOWN').toUpperCase();
  return upper === 'MODERATE' ? 'MEDIUM' : upper;
};

function npmFix(vuln) {
  if (vuln.fixAvailable === true) {
    return 'npm audit fix';
  }
  if (vuln.fixAvailable && vuln.fixAvailable.name) {
    return `${vuln.fixAvailable.name}@${vuln.fixAvailable.version}`;
  }
  return 'no fix available';
}

function npmFinding([name, vuln]) {
  const advisory = (vuln.via || []).find((v) => typeof v === 'object') || {};
  return {
    source: 'npm audit',
    id: advisory.url ? advisory.url.split('/').pop() : name,
    target: 'package-lock.json',
    pkg: name,
    installed: vuln.range || '-',
    fixed: npmFix(vuln),
    severity: normalise(vuln.severity),
    title: advisory.title || 'transitive',
  };
}

const npmFindings = (report) => Object.entries(report?.vulnerabilities || {}).map(npmFinding);

const vulnMapper = (source, target) => (v) => ({
  source, target, id: v.VulnerabilityID, pkg: v.PkgName, installed: v.InstalledVersion,
  fixed: v.FixedVersion || 'no fix available', severity: normalise(v.Severity), title: v.Title || '',
});
const secretMapper = (source, target) => (s) => ({
  source, target, id: s.RuleID, pkg: '(secret)', installed: '-',
  fixed: 'remove + rotate secret', severity: normalise(s.Severity), title: s.Title,
});
const misconfigMapper = (source, target) => (m) => ({
  source, target, id: m.ID, pkg: '(config)', installed: '-',
  fixed: m.Resolution || '-', severity: normalise(m.Severity), title: m.Title,
});

function trivyFindings(report, source) {
  return (report?.Results || []).flatMap((result) => [
    ...(result.Vulnerabilities || []).map(vulnMapper(source, result.Target)),
    ...(result.Secrets || []).map(secretMapper(source, result.Target)),
    ...(result.Misconfigurations || []).map(misconfigMapper(source, result.Target)),
  ]);
}

const action = (f) => {
  if (accepted.has(f.id)) {
    return 'Risk accepted (.trivyignore)';
  }
  if (f.fixed && !f.fixed.startsWith('no fix')) {
    return `Fix: upgrade/apply ${f.fixed}`;
  }
  return 'No fix yet - monitor & document';
};
const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 120);

const findings = [
  ...npmFindings(readJson('npm-audit.json')),
  ...trivyFindings(readJson('trivy-fs.json'), 'trivy fs'),
  ...trivyFindings(readJson('trivy-image.json'), 'trivy image'),
].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));

const sources = ['npm audit', 'trivy fs', 'trivy image'];
const lines = [
  '# Security scan summary',
  '',
  `Generated: ${new Date().toISOString()}  |  Build: ${process.env.BUILD_NUMBER || 'local'}  |  Image: ${process.env.IMAGE_TAG || 'n/a'}`,
  '',
  'Gate policy: build FAILS on any fixable HIGH/CRITICAL finding (npm audit --audit-level=high, trivy --severity HIGH,CRITICAL).',
  '',
  `| Scanner | ${SEVERITIES.join(' | ')} | Total |`,
  `|---|${SEVERITIES.map(() => '---').join('|')}|---|`,
  ...sources.map((src) => {
    const subset = findings.filter((f) => f.source === src);
    const counts = SEVERITIES.map((sev) => subset.filter((f) => f.severity === sev).length);
    return `| ${src} | ${counts.join(' | ')} | ${subset.length} |`;
  }),
  '',
];

if (findings.length === 0) {
  lines.push('**No vulnerabilities, secrets or misconfigurations detected.**');
} else {
  lines.push('| Severity | Scanner | ID | Package / target | Installed | Title | Action |', '|---|---|---|---|---|---|---|');
  for (const f of findings) {
    lines.push(`| ${f.severity} | ${f.source} | ${cell(f.id)} | ${cell(f.pkg)} (${cell(f.target)}) | ${cell(f.installed)} | ${cell(f.title)} | ${cell(action(f))} |`);
  }
}

const markdown = `${lines.join('\n')}\n`;
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'security-summary.md'), markdown);
console.log(markdown);
