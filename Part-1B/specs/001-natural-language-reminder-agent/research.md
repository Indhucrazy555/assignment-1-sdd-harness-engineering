# Research: Natural-Language Reminder Agent

**Feature**: `001-natural-language-reminder-agent`  
**Date**: 2026-11-20

## Decisions

### Runtime and TypeScript

- **Decision**: Use Node.js 24.x and strict TypeScript. The workspace currently provides
  Node.js 24.18.0. Pin compatible development dependencies in the implementation lockfile.
- **Rationale**: This meets the approved platform requirement and provides a stable built-in
  process, filesystem, cryptography, `Intl`, and test-runner surface.
- **Alternatives considered**: A web framework or an additional runtime abstraction. Rejected
  because the specification defines a single JSON request/response and explicitly excludes
  deployment infrastructure.

### JSON Schema Validation

- **Decision**: Use Ajv 8 configured for JSON Schema Draft 2020-12, plus `ajv-formats` for
  standard format assertions. Keep deterministic calendar, UTC-canonicalization, IANA-zone, and
  future-time checks in a separate validator.
- **Rationale**: The schema is normative and structural validation must be independent of the
  model. Ajv provides the required dialect; `ajv-formats` supplies its standard date-time
  format support. Neither layer substitutes for the separate invariants.
- **Alternatives considered**: Hand-written field checks or a custom JSON Schema validator.
  Rejected because they duplicate schema semantics and make unknown-property/status-branch
  validation easier to diverge from the approved schema.

### Test and Evaluation Runtime

- **Decision**: Use Node's built-in `node:test` and `node:assert/strict`; run evaluation through
  the same local TypeScript build and a deterministic case-keyed provider mock.
- **Rationale**: No test framework or live model is needed. The evaluation can replay all 27
  fixed cases without network access or credentials.
- **Alternatives considered**: A third-party test runner or live model calls. Rejected to keep
  the toolchain small and evaluation reproducible.

### Provider and Optional Live Integration

- **Decision**: Define an injectable provider interface and implement the deterministic mock
  required by the specification. Do not select or implement a vendor-specific live provider in
  this plan. Any future adapter must remain behind the interface and read optional credentials
  only from environment variables.
- **Rationale**: The specification does not identify a provider, API protocol, or model. Adding
  one would introduce external service assumptions and credentials without being needed by
  tests or evaluation.
- **Alternatives considered**: Embed a vendor SDK or make evaluation call a live API. Rejected
  because either would add credentials/network dependence and nondeterminism.

### Application Interface

- **Decision**: Provide a minimal stdin/stdout JSON CLI for manual requests and evaluation
  commands. Use distinct exit codes and stderr diagnostics for transport, provider, and
  application failures; valid clarification and rejection responses remain normal JSON
  responses.
- **Rationale**: The specification intentionally leaves the transport unspecified. A CLI is
  the smallest usable interface and has no server, port, or deployment requirements.
- **Alternatives considered**: REST API, chat UI, and persistent service. Rejected as outside
  the assignment scope.

### Evidence and Repair Orchestration

- **Decision**: Use a separate Node.js harness script with built-in `child_process`, `fs`, and
  `crypto`; store every run in a unique directory with SHA-256 manifests and write-once result
  files.
- **Rationale**: The constitution requires independent, immutable run/repair evidence and
  explicit human accountability. Built-ins are sufficient for this small local project.
- **Alternatives considered**: Database, hosted CI service, or external evidence platform.
  Rejected because none is required and each increases infrastructure or data exposure.

## Dependency Rationale

| Dependency | Use | Why it is justified |
|---|---|---|
| `ajv` (runtime) | Draft 2020-12 structural response validation | Required to apply the normative schema independently |
| `ajv-formats` (runtime) | JSON Schema `date-time` assertion | Completes Ajv's format validation; deterministic checks still verify canonical real UTC instants |
| `typescript` (development) | Compile and typecheck source/tests | Required by the TypeScript engineering constraint |
| `@types/node` (development) | Type Node built-ins | Keeps the TypeScript project type-safe |

No other runtime or development dependencies are planned. Test, CLI, harness, hashing, and
time-zone identifier checks use Node built-ins.

## Resolved Context

- Node.js v24.18.0 and npm 11.16.0 are available locally; use `npm.cmd` from Windows
  PowerShell where the `npm` PowerShell shim is blocked by execution policy.
- No package manifest or installed project dependencies exist in Part 1B yet.
- `.specify/extensions.yml` is absent, so no before/after plan hooks are registered.
- The approved specification is the source of truth for the 27 evaluation IDs and expected
  outcomes. The implementation dataset must provide deterministic controlled provider payloads
  for provider-invoking cases, preserve all IDs/expectations, and explicitly encode no-call
  cases and EVAL-024's controlled provider error. This fills the executable fixture detail
  required by FR-021; it does not add, remove, merge, or weaken cases.
- The controlled fixtures make the application and evaluation path reproducible; their score is
  not a claim about a live model's production quality. EVAL-024 is reported independently, and
  all 27 case records remain visible.
- The implementation schema asset must remain aligned with the Draft 2020-12 schema embedded
  in `spec.md`; the harness should detect drift rather than change the approved schema.

No unresolved technology choice blocks implementation. A live-provider vendor/protocol remains
intentionally unspecified and is not required for local evaluation.
