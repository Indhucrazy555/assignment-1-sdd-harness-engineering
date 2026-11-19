<!--
Sync Impact Report
Version change: unversioned template -> 1.0.0 (initial ratification)
Modified principles: none; all five principles are newly defined.
Added sections: Security and Data Integrity; Development Workflow and AI Assistance.
Removed sections: none.
Follow-up TODOs: none in this constitution; product contract decisions belong in the feature specification.
-->

# Smart Todo Management API Constitution

## Core Principles

### I. Explicit, Deterministic API Contract
The API MUST define its request and response schemas, validation rules, success and error status
codes, and filtering and sorting semantics before implementation. Equivalent requests against the
same persisted state MUST produce equivalent responses, excluding explicitly variable metadata
such as timestamps. The feature specification MUST resolve enum values, field limits, date and
time-zone rules, tag matching, sort direction and tie-breaking, and the data-file location; code
MUST NOT invent undocumented behavior.

### II. Simple, Layered TypeScript Architecture
The application MUST use TypeScript on Node.js with strict type checking enabled. HTTP routes,
business rules, and JSON-file persistence MUST remain separate layers with explicit interfaces.
Routes MUST translate HTTP input and output; business logic MUST own task rules; persistence MUST
own serialization and file access. New abstractions or external services MUST be justified by a
specific requirement.

### III. Validate Inputs and Preserve a Stable Error Contract
Every client-controlled path parameter, query parameter, and request body MUST be validated before
it can change task state. Invalid requests MUST leave persisted state unchanged. Errors MUST use a
consistent JSON envelope containing `error.code` and `error.message`, with optional structured
`error.details`; responses MUST NOT expose stack traces, secrets, or internal file paths. The API
specification MUST assign and tests MUST verify the exact HTTP status and error code for each
failure category.

### IV. Automated Tests Are Acceptance Evidence
Business rules MUST have unit tests, and API behavior MUST have automated tests through the HTTP
interface. Tests MUST cover create/read/update/delete, persistence across reload, every documented
filter and sort option, invalid input, missing resources, and the error contract. First-party
source MUST maintain at least 80% statement and branch coverage, excluding tests and generated
files. All tests MUST pass before a change is accepted; tests MUST NOT be deleted, skipped, or
weakened merely to obtain a passing result.

### V. Deterministic, Recoverable Local Persistence
The local JSON file MUST be the authoritative task store, and a successful write MUST survive
restarting the process. Persistence MUST preserve valid task data and MUST report read or write
failures explicitly; malformed or unavailable storage MUST NOT be silently replaced with empty
data or reported as a successful operation. Serialization and update behavior MUST be covered by
automated tests.

## Security and Data Integrity

All external input MUST be treated as untrusted and validated for type, allowed values, and
documented size or range limits. File operations MUST be confined to the configured task data file.
Credentials and secrets MUST NOT be committed or logged. Dependencies MUST be checked by an
automated security scan; unresolved critical or high-severity findings block acceptance unless a
documented, reviewed exception records the mitigation or false-positive rationale. Linting,
type-checking, tests, and the security scan MUST pass as quality gates.

## Development Workflow and AI Assistance

Implementation MUST follow an approved feature specification and plan. Changes MUST preserve all
specified behavior, and deviations MUST be resolved in the specification before implementation.
For each change, contributors MUST review the diff and verify the relevant automated tests,
linting, type-checking, and security results. AI-generated code or tests are proposals, not
verification: a contributor MUST compare them with the specification, inspect the complete diff,
and run the required checks. AI assistance MUST NOT remove requirements, suppress failures, or
weaken tests to create a passing result.

## Governance

This constitution governs feature specifications, plans, implementation, and review. A conflict
MUST be resolved in favor of this constitution; the affected specification MUST be updated before
implementation proceeds. Amendments MUST be made in this file, state their rationale, update the
last-amended date, and increment the version using semantic versioning: MAJOR for incompatible
governance changes, MINOR for new or materially expanded principles, and PATCH for clarifications
that do not change obligations. Every feature review MUST check compliance with this constitution
and report any unresolved deviation; exceptions require a documented rationale and approval before
the affected change is accepted.

**Version**: 1.0.0 | **Ratified**: 2026-11-19 | **Last Amended**: 2026-11-19
