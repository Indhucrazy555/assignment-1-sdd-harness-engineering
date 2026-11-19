# Harness Guide

The harness independently validates the application; application tests remain in `tests/`.
`.harness/policy.json` is the source of truth for check order, commands, supported tool
versions, and thresholds. Run the full matrix with:

```powershell
node .harness/run.mjs --phase initial
node .harness/run.mjs --phase repair --round 001
node .harness/run.mjs --phase final
node .harness/run.mjs --phase final --revision 002
```

In PowerShell, invoke standalone npm commands as `npm.cmd`; the runner resolves npm
cross-platform. Use `node .harness/run.mjs --help` for runner options.

## Fixed check matrix

Checks run in this order. Safe checks continue after failures; checks missing prerequisites
or using unsupported tool versions are `BLOCKED`, never `PASS`.

| Order | Check | Policy command |
|---|---|---|
| 1 | Syntax | `node .harness/checks/syntax.mjs` |
| 2 | Lint | `npm run lint` |
| 3 | TypeScript | `npm run typecheck` |
| 4 | Security audit | `npm audit --audit-level=high` |
| 5 | Unit tests | `npm run test:unit` |
| 6 | Integration tests | `npm run test:integration` |
| 7 | HTTP contract tests | `npm run test:contract` |
| 8 | Coverage | `npm run test:coverage` |
| 9 | Integrity | `node .harness/checks/verify-integrity.mjs` |

The policy supports Node.js `>=24 <25`, npm `11.16.0`, TypeScript `6.0.3`,
`@types/node` `24.19.2`, ESLint `10.15.0`, `typescript-eslint` `8.73.0`, and c8 `12.0.0`.
High and critical audit findings fail the security check; lower-severity findings remain in
the logs. Coverage applies to `src/**/*.ts` and requires at least 80% statements and 80%
branches using c8 `--all --include "src/**/*.ts" --check-coverage --statements 80 --branches 80`.

The unit, integration, and HTTP contract commands execute application tests. Syntax parsing,
lint, TypeScript checking, audit, and integrity are separate harness checks. Do not remove
or skip acceptance tests, change protected requirements, suppress audit failures, or lower
coverage thresholds to get a pass.

## Component responsibilities

- `run.mjs` enforces policy order and tool versions, records results/logs, preserves snapshots,
  and validates feedback and human decisions.
- `checks/syntax.mjs` parses first-party TypeScript without emitting files;
  `checks/verify-integrity.mjs` compares approved baselines and checks test/coverage markers.
- `schemas/` defines the required shapes for run results, AI failure feedback, and human decisions.
- Application tests verify API behavior; harness checks independently validate code and evidence.

## Integrity and results

Integrity compares the T019 baselines in `evidence/baseline/` against the specification,
OpenAPI contract, protected harness controls, package scripts and lockfile, and the reviewed
acceptance-test inventory. It also detects unexpected or skipped/todo tests and coverage-ignore
directives. It never creates or updates baselines. A missing-baseline pre-implementation state
cannot produce `PASS` (`BLOCKED` when there are no other integrity findings); changed inputs or
test inventory require human review and explicit re-baselining.

Each matrix run records its command, tool versions, timestamps, exit code, outcome, and stdout
and stderr logs in `evidence/<phase>/runs/<run-id>/`. `results.json` follows
`schemas/check-result.schema.json`; `run.sha256` hashes the run artifacts. Genuine failed
checks produce schema-validated `agent-feedback.json`; blocked checks do not. `.harness/output/`
is a convenience mirror, not the canonical evidence location.

If the immutable final snapshot already exists, preserve it and create a numbered version with
`node .harness/run.mjs --phase final --revision 002`. The snapshot is stored under
`evidence/final/revisions/002/`; its full-matrix run remains under `evidence/final/runs/` and
records the snapshot manifest path.

Phase snapshots and human decisions are described in [`../evidence/README.md`](../evidence/README.md).
