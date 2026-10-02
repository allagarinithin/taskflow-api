# Security process and findings register

## Controls built into the pipeline
| Layer | Control |
|---|---|
| Dependencies (SCA) | `npm audit --omit=dev --audit-level=high` gate on production dependencies |
| Repository | Trivy `fs`: vulnerable lockfile entries, leaked secrets, Dockerfile misconfigurations |
| Container image | Trivy `image`: OS packages + bundled libraries; gate on fixable HIGH/CRITICAL |
| Image hardening | multi-stage build, non-root `node` user, `apk upgrade`, npm/yarn/corepack removed from runtime, read-only root filesystem, `no-new-privileges`, memory/CPU limits |
| Application | helmet security headers, bcrypt password hashing, HS256-pinned JWT verification, auth rate limiting, 10 kB body limit, field whitelisting (no mass-assignment), ReDoS-safe validation, no stack traces in 5xx responses |
| Secrets | no secrets in git; JWT and chaos tokens injected from Jenkins credentials; app refuses to start in production with a weak secret |

## Findings register
Fill this in from `reports/security/security-summary.md` of your final build.
Severity uses the scanner's CVSS-based rating.

| ID | Package / file | Severity | What the issue is | Action taken | Status |
|---|---|---|---|---|---|
| _e.g. CVE-XXXX-YYYY_ | _libssl3 (alpine)_ | _HIGH_ | _…_ | _bumped base image / `apk upgrade`_ | _Fixed in build #N_ |

## Accepted risks
Any entry in `.trivyignore` must appear here with justification, owner and review date.
