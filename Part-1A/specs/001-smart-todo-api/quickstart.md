# Quickstart: Smart Todo Management API and Harness

This guide covers the application test suites and independent harness validation after
implementation. Run commands from the `Part-1A` project directory. The harness is the source of
assignment evidence; a developer's or AI agent's summary is not a check result.

## Prerequisites

- Node.js 24.x and npm.
- The API is local-only and listens on `127.0.0.1:3000`.

## Application tests versus harness validation

Application tests live under `tests/`:

- `tests/unit/` checks field validation and task business rules.
- `tests/integration/` checks JSON persistence, restart behavior, and storage failures.
- `tests/contract/` makes HTTP requests to the loopback service and checks the approved API
  contract, including exact statuses and response/error shapes.

The independent harness lives under `.harness/`. It runs a separate syntax parse, ESLint,
TypeScript type-check, dependency audit, each application test suite, the coverage gate, and
protected-input/test-inventory checks. The harness does not replace those tests or edit
application files.

## Capture initial results

After the first AI-generated implementation and application tests exist, but before any repair,
run the fixed check matrix:

In PowerShell:

```powershell
npm.cmd ci
node .harness/run.mjs --phase initial
```

In other shells, use `npm ci` followed by the same `node .harness/run.mjs --phase initial`
command.

The runner records every check's command, outcome, UTC timestamps, exit status, failure details,
and stdout/stderr log references. A missing command or blocked check is recorded as `BLOCKED`,
never as a pass. The initial source snapshot and its hashes are preserved in
`evidence/initial/implementation/`. Each run is stored in
`evidence/initial/runs/<run-id>/`; when checks fail, the runner writes schema-validated
`agent-feedback.json` in that run directory and links the failures to the captured logs.

The required matrix is fixed: syntax, lint, TypeScript, `npm audit --audit-level=high`, unit
tests, integration tests, HTTP contract tests, and the combined coverage run enforcing at least
80% statements and 80% branches across first-party TypeScript source using c8's
`--all --check-coverage --statements 80 --branches 80` options. No check may be skipped or any
high/critical audit failure suppressed, and thresholds may not be lowered. Lower-severity audit
findings remain visible in the captured output.

## Repair and revalidate

After the AI agent makes an application repair, rerun the complete unchanged matrix for each
repair round, not just the previously failing check:

```powershell
node .harness/run.mjs --phase repair --round 001
```

Each round keeps its own snapshot and run directories under
`evidence/repairs/round-001/`. Feedback, when produced, is in that run's `agent-feedback.json`;
it includes the check/test ID, exact command, exit status, expected-versus-actual details when
available, and links to captured output. The agent may use that evidence to repair application
code; it cannot change the specification, harness policy, thresholds, or prior evidence. Any
acceptance-test change requires human review and an explicitly updated baseline; removing,
skipping, or weakening approved tests is prohibited.

When the repair cycle ends, capture the final candidate and rerun the complete matrix, whether
the candidate is expected to pass or be rejected:

```powershell
node .harness/run.mjs --phase final
```

The final candidate snapshot and full check matrix go under `evidence/final/`. A human reviewer
records `ACCEPT` only if all required checks pass and protected inputs remain unchanged;
otherwise the reviewer records `REJECT` with rationale, reviewer, timestamp, and final run ID in
`evidence/human-decision.json`. Passing checks alone never create an automatic acceptance.
Any later application, test, contract, or policy change invalidates that final result and
requires another complete run.

## Required assignment evidence

Retain the pre-implementation protected-input and harness-control hashes and acceptance-test
inventory, immutable initial and final implementation snapshots and manifests, initial and final
per-check result records, every repair-round record, all per-check stdout/stderr logs, structured
AI feedback for genuine failures, and the human decision with rationale. Do not overwrite or
discard failed initial or repair evidence.

## Start the API

In a separate terminal:

```powershell
npm.cmd start
```

The service binds only to loopback. `data/tasks.json` is created after the first successful
mutation; keep this local task data out of source control.

## Exercise task creation and list behavior

```powershell
curl.exe -i -X POST "http://127.0.0.1:3000/tasks" `
  -H "Content-Type: application/json" `
  -d '{"title":"Prepare report","description":"Review the draft","priority":"medium","tags":["work"]}'
```

Expected: `201 Created`, a `Location` header, and the complete task object with generated UUID
and UTC `createdAt`, default status `pending`, and `dueDate: null`.

```powershell
curl.exe -i "http://127.0.0.1:3000/tasks?priority=medium&tags=work&sort=priority"
```

Expected: `200 OK`, a `tasks` array and matching `count`; all supplied filters are combined with
AND. Priority sort is high-to-low with deterministic tie-breaks.

## Acceptance checks

The current integration suite has a known test-setup failure: one fixture attempts to create a
file beneath `nested/` before creating that parent directory. It fails with `ENOENT` before the
store operation is exercised; do not treat it as an application storage failure or modify the
fixture to hide the issue.

The application test suites must independently verify:

1. All five routes and their exact status/body contracts.
2. Field, query, date, content-type, and 65,536-byte body validation.
3. Filter combinations and both default and priority ordering.
4. Persistence across a fresh process, malformed/unavailable storage, and failed writes.
5. Overlapping mutations are serialized and successful task changes are not lost.
6. Loopback access succeeds and non-loopback access cannot retrieve task data.

The harness must independently record its syntax, lint, TypeScript, audit, test, coverage, and
integrity checks. It must not infer a pass from the application test suite alone.

For manual restart validation, create a task, stop the service with `Ctrl+C`, start it again, and
retrieve the task by its returned ID. Do not delete the live data file as test cleanup; automated
tests must use isolated temporary stores.
