# Research: Smart Todo Management API

## Context

The Part-1A project contains Spec Kit documentation but no application source, package manifest,
or established runtime/test conventions. The local environment provides Node.js 24.18.0 and npm
11.16.0. Decisions below preserve the specification and constitution while keeping the first
implementation small.

## Decisions

### Runtime and TypeScript

- **Decision**: Use Node.js 24 LTS and the TypeScript compiler with strict type checking. Pin
  exact dependency versions in `package-lock.json`; set the supported Node major in the package
  metadata and CI.
- **Rationale**: Node 24 is an LTS release and matches the available local runtime. Compiling
  TypeScript to JavaScript avoids relying on runtime TypeScript transformation.
- **Alternatives considered**: Node 26 LTS is also supported by the current release schedule, but
  using it would diverge from the available Node 24 environment without a feature need.
- **Sources**: [Node.js release schedule](https://nodejs.org/en/about/previous-releases);
  [TypeScript `strict` option](https://www.typescriptlang.org/tsconfig/#strict).

### HTTP layer

- **Decision**: Use Node's built-in `node:http` module with one explicit route dispatcher and
  bounded JSON body parsing. Bind the server to `127.0.0.1`.
- **Rationale**: Five endpoints do not require a runtime framework. Avoiding one reduces runtime
  dependency and audit surface. The HTTP module is intentionally low-level, so the route layer
  must explicitly enforce the content type, 65,536-byte limit, JSON parsing, and error mapping.
- **Alternatives considered**: Express provides routing and middleware, but would add a runtime
  package and middleware configuration for a small fixed API.
- **Source**: [Node.js HTTP API](https://nodejs.org/api/http.html), which documents the built-in
  HTTP server and its low-level message parsing responsibilities.

### Testing and coverage

- **Decision**: Use stable `node:test` and `node:assert/strict` for unit, persistence, and
  loopback API tests. Compile TypeScript first, run tests on the emitted JavaScript, and use c8
  with `--all --check-coverage --statements 80 --branches 80` to enforce the constitution's
  minimum 80% statement and branch coverage across first-party TypeScript source.
- **Rationale**: Node's test runner is stable and requires no separate test framework. c8
  provides coverage threshold enforcement without depending on experimental Node coverage flags.
- **Alternatives considered**: Jest or Vitest provide broader ecosystems but add more setup and
  dependencies than this assignment requires.
- **Sources**: [Node.js test runner](https://nodejs.org/api/test.html);
  [c8](https://github.com/bcoe/c8), including its documented `--statements` and `--branches`
  threshold options.

### JSON persistence and mutation ordering

- **Decision**: Serialize task mutations through one in-process queue. Write the complete next
  JSON representation to a uniquely named temporary file in the data directory, then replace
  `data/tasks.json`. Do not report mutation success until replacement succeeds.
- **Rationale**: The filesystem API does not synchronize concurrent modifications to the same
  file. The queue prevents lost updates within the supported single-process scope; same-directory
  replacement avoids exposing a partially serialized document. Failed writes must preserve the
  previous valid file and surface the specified storage error.
- **Alternatives considered**: Directly overwriting the data file is simpler but can truncate
  valid data if a write fails. A database or multi-process locking is outside this assignment's
  local single-process scope.
- **Source**: [Node.js file system API](https://nodejs.org/api/fs.html), which warns that
  concurrent filesystem modifications are not synchronized.

### API contract and quality gates

- **Decision**: Maintain an OpenAPI 3.1.1 document as the API contract. Run strict type-checking,
  ESLint, unit/API tests with coverage thresholds, and `npm audit --audit-level=high` locally and
  in CI. High/critical findings fail the check; lower-severity findings remain visible in evidence.
- **Rationale**: A machine-readable contract makes endpoint, request, response, and error shapes
  reviewable. The explicit audit threshold matches the constitution's critical/high acceptance
  policy while retaining the complete audit output for review.
- **Alternatives considered**: Duplicating the API contract only in prose would make automated
  contract review harder. Automatically applying audit fixes is not selected because changes
  require review and tests.
- **Sources**: [OpenAPI Specification 3.1.1](https://spec.openapis.org/oas/v3.1.1);
  [npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/), including its
  `--audit-level=high` exit threshold.

### Independent Harness and Evidence

- **Decision**: Add a cross-platform Node-based harness under `.harness/` with a fixed, versioned
  command policy. It independently runs syntax, lint, type, audit, test, coverage, and integrity
  checks; stores structured per-check results and full logs under `evidence/`; and emits a
  structured feedback bundle only from genuine failures.
- **Rationale**: A separate orchestrator makes the same checks repeatable before and after repair
  and records machine-verifiable outcomes rather than relying on an AI agent's self-report.
  Separate application tests remain the source of behavior assertions; the harness invokes and
  records them but does not replace them.
- **Integrity and workflow**: After all acceptance tests are authored and reviewed, but before
  application implementation, hash the approved specification, API contract, harness code and
  policy, fixed thresholds, package scripts, and lockfile, and freeze the acceptance-test
  inventory. Reject missing/skipped tests; acceptance-test changes require human review and an explicitly updated
  baseline, without weakening approved behavior. Preserve write-once initial and final
  implementation snapshots, initial/final results, per-check logs, all repair-round results, and
  a human `ACCEPT`/`REJECT` decision with rationale. The harness must never edit criteria or
  tests, reduce thresholds, suppress high/critical audit failures, or manufacture a pass.
- **Alternatives considered**: Asking the AI agent to run commands and summarize them is not
  independent or sufficient evidence. Running only failed checks after a repair risks missing
  regressions; every repair therefore reruns the same full matrix.

## Remaining Research

No product or technical decisions block implementation planning. The specification intentionally
sets no throughput, availability, or task-count target for this single-user assignment.
