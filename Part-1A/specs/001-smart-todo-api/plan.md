# Implementation Plan: Smart Todo Management API

**Branch**: `001-smart-todo-api` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-smart-todo-api/spec.md`

## Summary

Build the specified single-user task REST API with strict TypeScript on Node.js 24 LTS. Use the
Node.js HTTP and filesystem modules to keep runtime dependencies minimal. Separate HTTP handling,
task rules, and JSON persistence. Serialize mutations and save through a same-directory temporary
file followed by replacement. Validate the public contract with application unit, integration,
and HTTP contract tests, then run them through an independent harness that records all static,
security, test, and coverage results as assignment evidence.

## Technical Context

**Language/Version**: TypeScript with strict compiler options; Node.js 24 LTS (Node 24.18.0 is
available in the project environment)

**Primary Dependencies**: No runtime package dependencies; built-in `node:http`, `node:fs/promises`,
`node:path`, and `node:crypto`. Development dependencies: TypeScript, Node.js type definitions,
ESLint with TypeScript support, and c8 for coverage thresholds.

**Storage**: UTF-8 JSON at `data/tasks.json` in the application project directory; mutations are
serialized and persisted by replacing the file only after a complete temporary file is written.

**Testing**: Stable built-in `node:test` and `node:assert/strict`; compile TypeScript before
running application tests. Unit, integration, and HTTP contract suites are separate. c8 enforces
at least 80% statement and branch coverage using `--all`, `--check-coverage`, `--statements 80`,
and `--branches 80` across first-party TypeScript source. API tests bind to loopback on an
ephemeral port and use isolated temporary stores. The independent `.harness/` runner captures
each required check and its raw logs under `evidence/`.

**Target Platform**: Cross-platform Node.js 24 LTS on Windows, macOS, or Linux; service access is
limited to loopback.

**Project Type**: Single backend web service.

**Performance Goals**: No throughput or latency service-level objective is specified. The
assignment targets one local user and returns the complete matching collection.

**Constraints**: Strict TypeScript; five task endpoints; 65,536-byte request-body limit; one
active process; sequential mutations; one local JSON store; loopback-only access; no credentials
or authentication; preserve the specified error contract. The harness must preserve the approved
specification, tests, and fixed 80% coverage thresholds; it cannot turn missing or failing checks
into passes. No task-count or pagination limit is introduced.

**Scale/Scope**: One local user and one process; one task entity; CRUD, list filters, priority
sorting, validation, and durable local persistence.

## Constitution Check

| Principle or constraint | Plan response | Gate |
|---|---|---|
| Explicit, deterministic API contract | OpenAPI contract mirrors the spec's schemas, statuses, filters, and ordering | Pass |
| Simple layered TypeScript architecture | HTTP, domain/service, validation, and JSON persistence remain separate; no runtime framework | Pass |
| Validate inputs and preserve error contract | Bounded JSON parsing and shared error mapping are covered by API tests | Pass |
| Automated tests are acceptance evidence | Separate unit, integration, and HTTP contract suites; c8 enforces 80% statement and branch coverage | Pass |
| Deterministic, recoverable local persistence | In-process mutation queue, temporary-file replacement, and restart/failure tests | Pass |
| Security and data integrity | Bind to loopback; cap bodies; run `npm audit --audit-level=high` and fail on high/critical findings; retain audit output; ignore local data file | Pass |
| AI-assisted implementation and quality gates | Independent fixed checks, genuine failure feedback, immutable initial/final snapshots, and human decision; no skipped or weakened tests | Pass |

No constitution violations are identified. Implementation remains gated on review of this plan
and on the specification's acceptance criteria.

**Post-design recheck**: Pass. The data model, OpenAPI contract, and quickstart preserve the
loopback-only scope, exact validation and error contract, deterministic ordering, layered
architecture, persistence guarantees, and required quality gates. Harness controls preserve the
specification, application tests, and thresholds. No deviations were introduced.

## Harness Architecture

The harness is an independent validation and evidence layer; it is not part of the task API and
does not replace application tests. Application tests live under `tests/` and assert task
behavior. The harness invokes those suites and separately validates syntax, lint, types,
dependencies, coverage, protected inputs, and evidence. It determines outcomes from process exit
codes and captured test results, never from an AI agent's claim that a check passed.

### Fixed Check Matrix

`.harness/policy.json` defines the required checks, exact command arguments, order, tool versions,
and coverage thresholds. On Windows the runner resolves npm commands to `npm.cmd`; elsewhere it
uses `npm`. Each run executes this same matrix:

| Check | Command | Purpose |
|---|---|---|
| Syntax | `node .harness/checks/syntax.mjs` | Parse every application TypeScript file without emitting output or doing type analysis |
| Lint | `npm run lint` | Run ESLint independently of syntax and type checks |
| TypeScript | `npm run typecheck` | Run `tsc --noEmit` with strict compiler options |
| Security | `npm audit --audit-level=high` | Audit the locked dependency tree; high/critical findings fail and all findings remain visible in logs |
| Unit tests | `npm run test:unit` | Test validation and task rules in isolation |
| Integration tests | `npm run test:integration` | Test JSON persistence, restart, and failure handling |
| HTTP contract tests | `npm run test:contract` | Exercise the live loopback HTTP API against the approved contract |
| Coverage | `npm run test:coverage` | Rerun all application suites under c8 with `--all --check-coverage --statements 80 --branches 80`, measuring first-party TypeScript source |
| Integrity | `node .harness/checks/verify-integrity.mjs` | Verify protected spec/contract and harness hashes, package-script/lockfile hashes, test inventory, and unchanged policy |

The test suites are application tests, not harness validation. The syntax, lint, TypeScript,
security, coverage enforcement, integrity, orchestration, and evidence checks are independent
harness checks. If a prerequisite prevents a check from running, its result is `BLOCKED`, never
`PASS`; every matrix entry receives a result record. Independent later checks continue after a
failure when safe to run.

### Harness Components and Responsibilities

- **`policy.json`**: Fixed check IDs, commands, order, supported tool versions, protected files,
  and immutable 80% statement/branch thresholds.
- **`run.mjs`**: Cross-platform orchestrator. Starts each check as a separate process, captures
  stdout/stderr and exit status, records UTC start/end times, and writes a result for every check.
  It runs checks only; it does not edit application files, tests, specifications, or thresholds.
- **`checks/syntax.mjs`**: Uses the TypeScript parser to report syntax diagnostics without
  emitting JavaScript; this is distinct from ESLint and `tsc --noEmit`.
- **`checks/verify-integrity.mjs`**: Compares approved specification and API-contract hashes
  with the baseline; verifies the harness runner, policy, schemas, command matrix, package
  scripts, and lockfile; detects removed, skipped, or `todo` acceptance tests and coverage-ignore
  directives; and reports edits to existing tests for human review.
- **`schemas/`**: JSON Schemas for per-check/run results, AI failure feedback, and the human
  decision record.
- **Application test suites (`tests/`)**: Unit tests cover validation and task rules; integration
  tests cover JSON persistence and failure recovery; HTTP contract tests make real loopback
  requests and assert exact statuses, headers, response schemas, ordering, and error envelopes.
- **Evidence recorder**: Stores a JSON result record per run plus stdout/stderr logs per check.
  Each check record includes `run_id`, `check_id`, exact command and arguments, tool versions,
  `started_at_utc`, `completed_at_utc`, `outcome` (`PASS`, `FAIL`, or `BLOCKED`), `exit_code`,
  stdout/stderr log paths, and `failure_details` such as failed test IDs, assertion expected and
  actual values, or process errors. `PASS` requires a successful exit and no skipped acceptance
  tests; absent evidence is never treated as success. Existing evidence is write-once; every
  snapshot, result file, and log has a recorded hash, and hash drift invalidates the run.
- **Failure-feedback formatter**: Builds structured `agent-feedback.json` only from actual failed
  check records and test output. It includes the failing check, reproduction command, expected and
  actual values when available, failure excerpt, and full-log references. The AI coding agent
  receives this bundle read-only; it cannot edit the evidence or turn a failure into success.
- **Snapshot and decision recorder**: Preserves the initial generated implementation before
  repairs and the final end-state candidate after a complete final validation, each with a
  file-hash manifest even if final checks fail. Snapshots include source, tests, package
  manifests, and project configuration, excluding `node_modules`, generated build output, task
  data, and secrets. It records the final human
  `ACCEPT` or `REJECT`, rationale, reviewer, timestamp, and run ID.
  Passing checks do not automatically accept the implementation.

### Harness Requirement Traceability

| Assignment requirement | Planned evidence |
|---|---|
| Independent syntax, lint, and TypeScript checks | Separate syntax, lint, and typecheck entries in the fixed check matrix |
| Automated security scan | `npm audit --audit-level=high` check with actual exit code and full output logged |
| Unit, integration, and HTTP contract tests | Separate application suites and independent harness invocations |
| At least 80% statement and branch coverage | Fixed c8 thresholds in policy and repeated coverage gate |
| Structured per-check results | Result schema captures command, outcome, timestamps, exit status, logs, and failure details |
| Genuine failure feedback for AI | Feedback formatter derives structured records from failed commands and test output |
| Repair and revalidation | Each repair round reruns the same complete matrix and saves separate evidence |
| Initial and final implementation preservation | Immutable snapshots and SHA-256 manifests under `evidence/initial/` and `evidence/final/` |
| Human final decision | Human-authored `ACCEPT`/`REJECT` and rationale linked to the final run |

### Proposed Harness and Evidence Layout

These are planned directories and artifacts; this planning update does not create harness code,
application source, or evidence snapshots.

```text
.harness/
├── README.md
├── policy.json
├── run.mjs
├── checks/
│   ├── syntax.mjs
│   └── verify-integrity.mjs
└── schemas/
    ├── check-result.schema.json
    ├── agent-feedback.schema.json
    └── human-decision.schema.json

evidence/
├── README.md
├── baseline/
│   ├── protected-inputs.sha256
│   ├── harness-control.sha256
│   └── acceptance-test-inventory.json
├── initial/
│   ├── implementation/           # Immutable initial AI-generated snapshot
│   ├── implementation.sha256
│   ├── results.json               # Every initial check and outcome
│   ├── logs/
│   │   └── <check-id>.log
│   └── agent-feedback.json        # Genuine initial failures, if any
├── repairs/
│   └── round-001/
│       ├── results.json
│       ├── logs/
│       └── agent-feedback.json
├── final/
│   ├── implementation/           # Immutable final repaired snapshot
│   ├── implementation.sha256
│   ├── results.json               # Same full check matrix as initial
│   └── logs/
│       └── <check-id>.log
└── human-decision.json            # ACCEPT/REJECT plus rationale; human-authored
```

### Feedback, Repair, and Acceptance Protocol

1. After all application acceptance-test files are created and reviewed, but before application
   implementation begins, a human-reviewed baseline freezes `spec.md`, `contracts/openapi.yaml`,
   the complete acceptance-test inventory (each test path and SHA-256 hash), harness
   runner/checks/schemas, check policy, command matrix, thresholds, `package.json` scripts, and
   `package-lock.json`. Record the protected-input
   and harness-control manifests under `evidence/baseline/`, including package-script and lockfile
   hashes, and store the acceptance-test inventory there. The harness treats these as read-only
   acceptance inputs and never regenerates their hashes automatically; any baseline change blocks
   the run until a human reviews and approves it.
2. After the first AI-generated application implementation exists, capture the immutable
   `initial/implementation/` snapshot and run the complete matrix. Preserve initial failures and
   logs exactly; do not repair before recording this baseline.
3. Give the AI coding agent the generated structured feedback plus linked logs. The agent may
   repair application code, but the harness never edits source, requirements, tests, or evidence.
4. After every repair round, rerun the complete matrix with the same commands, order, thresholds,
   lockfile, and Node major. Do not rerun only failed checks and present that as final validation.
5. The integrity check blocks acceptance if protected criteria or thresholds changed, an
   acceptance test was removed or skipped, or evidence is missing. The runner fails if test
   output reports skipped, todo, or cancelled acceptance tests. Any addition, removal, or edit to
   an acceptance-test file after the pre-implementation baseline requires human review and an
   explicitly updated baseline; preserve the prior baseline and evidence. No re-baselining may
   weaken or remove approved behavior.
6. When the repair cycle ends, preserve the end-state implementation snapshot and results from a
   complete final matrix, even if some checks fail. A human reviewer records `ACCEPT` only when
   every required check passes and protected inputs remain unchanged; otherwise the reviewer
   records `REJECT` and the rationale in `human-decision.json`. Any subsequent code, test, policy,
   or contract change invalidates the final run and requires a new complete validation.

The harness must not modify acceptance criteria, delete or skip tests, reduce coverage thresholds,
ignore or suppress `npm audit --audit-level=high` failures, fabricate check records, or treat
missing evidence as a pass. High/critical findings fail the security check; lower-severity
findings remain visible in the captured output. Initial results, every repair round, final
results, logs, both implementation snapshots, and the human decision are required assignment
evidence.

## Project Structure

### Documentation (this feature)

```text
specs/001-smart-todo-api/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
├── checklists/
│   └── requirements.md
└── tasks.md                 # Created by /speckit-tasks, not by this plan
```

### Source Code (project root)

```text
Part-1A/
├── src/
│   ├── server.ts
│   ├── domain/
│   │   └── task.ts
│   ├── errors/
│   │   └── api-error.ts
│   ├── http/
│   │   └── task-routes.ts
│   ├── persistence/
│   │   └── json-task-store.ts
│   ├── services/
│   │   └── task-service.ts
│   └── validation/
│       └── task-validation.ts
├── tests/
│   ├── integration/
│   │   └── json-task-store.test.ts
│   ├── contract/
│   │   └── tasks.http.contract.test.ts
│   └── unit/
│       ├── task-service.test.ts
│       └── task-validation.test.ts
├── .harness/                 # Independent validation orchestrator and fixed policy
├── evidence/                 # Append-only initial, repair, final, and decision evidence
├── .github/
│   └── workflows/
│       └── ci.yml
├── data/                    # Runtime-created; task data is gitignored
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
└── eslint.config.mjs
```

**Structure Decision**: One service project with a single HTTP adapter, task service, and JSON
store. Tests mirror the unit, persistence, and public HTTP boundaries. The application factory
accepts a store instance so tests can use temporary directories without changing the production
path. No frontend, database, runtime framework, or dependency-injection container is planned.

## Complexity Tracking

No constitution violations or additional project boundaries require justification.
