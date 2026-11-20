# Implementation Plan: Natural-Language Reminder Agent

**Branch**: `001-natural-language-reminder-agent` | **Date**: 2026-11-20 | **Spec**:
[spec.md](./spec.md)

**Input**: Approved feature specification, requirements checklist, and project constitution.

## Summary

Implement a small TypeScript/Node.js JSON-in/JSON-out CLI around an injectable reminder
provider. The application validates request context, calls the provider only when appropriate,
and validates returned data through independent JSON Schema, deterministic-invariant, and
semantic-evaluation layers. A deterministic mock provider drives all automated tests and all 27
specification cases. A separate Node.js harness runs the fixed checks, records immutable
synthetic evidence and structured failures, and leaves final acceptance to a human.

## Technical Context

**Language/Version**: TypeScript, strict mode; Node.js 24.x (workspace runtime: 24.18.0).

**Primary Dependencies**: Runtime: Ajv 8 with `ajv-formats` for Draft 2020-12 response-schema
validation. Development: TypeScript 5.x and matching `@types/node`. Use Node built-ins for
testing, assertions, CLI I/O, process orchestration, hashing, and evidence files. No model SDK,
web framework, database, or live-provider package is planned.

**Storage**: No application reminder storage. Harness evidence is written to unique,
write-once run directories and contains only synthetic evaluation inputs and outputs.

**Testing**: Node's built-in `node:test` and `node:assert/strict`; TypeScript typecheck/build;
unit, CLI integration, and evaluation-layer tests; deterministic run of all 27 case IDs.

**Target Platform**: Node.js 24.x on Windows, macOS, or Linux. No network access or credentials
are required for setup, tests, evaluation, or harness execution.

**Project Type**: Single TypeScript CLI/application plus a separate evidence harness.

**Performance Goals**: No latency or throughput target is specified. The 27-case evaluation
must complete locally without live model access.

**Constraints**: Preserve the approved schema, all 27 case IDs and expected outcomes, the three
independently reported validation layers, 80.00% semantic threshold, and the zero-side-effect
scope. Evaluation has 26 JSON-response cases (130 possible semantic points); EVAL-024 is a
separate expected provider-failure check and is excluded from that denominator. Any schema or
deterministic failure fails the run; semantic scoring must reach at least 104/130 points.
Every case result and any semantic shortfall remains visible and recorded even when the
aggregate reaches its threshold. The harness must preserve original synthetic outputs,
failures, repair rounds, and final evidence; it must never make the human ACCEPT/REJECT
decision.

**Scale/Scope**: One request at a time; one reminder interpretation per request; 27 stable
evaluation cases; no reminder scheduling, delivery, persistence, REST service, frontend, or
deployment infrastructure.

## Constitution Check

| Principle | Plan response | Gate |
|---|---|---|
| I. Structured output | Treat the specification's response schema as normative; validate every provider result before returning it. | Pass |
| II. Uncertainty | Preflight only explicit input/context; never use system time or locale. Preserve clarification outcomes and null unresolved fields. | Pass |
| III. Safety | Treat request/provider content as data; no tools, side effects, or reminder persistence. | Pass |
| IV. Independent validation | Run Ajv schema, deterministic invariants, and case-based semantic scoring as separate report sections. | Pass |
| V. Reproducibility | Inject a case-keyed deterministic mock provider; tests/evaluation use no network or credentials. | Pass |
| VI. Privacy | Keep runtime processing in memory; retain only synthetic evaluation evidence; redact environment values from diagnostics. | Pass |
| VII. Traceability/evidence | Map FRs to the existing evaluation IDs and per-run results; hash immutable initial, repair, and final evidence. | Pass |
| VIII. Human accountability | Record final reviewer decision separately; automated PASS remains pending human review. | Pass |
| Additional simplicity constraint | Use Node built-ins except Ajv/format support and TypeScript tooling; no service, database, or model SDK. | Pass |

No constitution violations are identified. The complete requirement-to-case map remains in
[spec.md](./spec.md); this plan does not alter it or reproduce the 27 case definitions.

**Post-design recheck**: Pass. The model, interface, validation, evaluation, harness, and
quickstart preserve the specification and constitution. The response schema is not restated in
a new planning contract; implementation must keep its runtime schema asset aligned with the
approved schema in `spec.md`. No `tasks.md` or implementation code is created by this phase.

## Architecture

1. **CLI boundary**: Read one JSON request from stdin and write one schema-conformant
   interpretation to stdout. Report transport/provider/application failures separately on
   stderr with nonzero exit codes; never convert a provider failure into a reminder response.
2. **Application service**: Validate the request envelope, text bounds, supplied UTC reference,
   and supplied IANA zone before calling a provider. Missing required context returns a
   clarification without a provider call. Pass only the request and explicit context to the
   provider.
3. **Provider boundary**: Define a narrow `ReminderProvider` interface whose result is untrusted
   `unknown` data. A deterministic `MockProvider` supplies controlled output or the expected
   EVAL-024 failure by case ID. It fails explicitly for an unconfigured case; no success-shaped
   fallback is allowed. A live provider adapter is not in this scope because no vendor or
   protocol is specified. If one is later approved, it must be isolated behind this interface
   and configured only from environment variables.
4. **Structural validation**: Validate every completed provider response against the
   specification's Draft 2020-12 schema. Keep the implementation schema asset synchronized
   with the fenced normative schema in `spec.md`; the harness checks for drift.
5. **Deterministic validation**: Independently check status invariants, exact fields, real
   canonical UTC timestamps, future-time ordering, and IANA-zone validity. Use built-in
   `Date`/`Intl` for these checks; do not treat JSON Schema `format` or a model claim as proof.
6. **Semantic evaluation**: Compare each response with that case's expected status and fields;
   apply the exact 0–5 rubric and 80.00% aggregate threshold from `spec.md`. Report the score
   and validation result for every case. Record each semantic shortfall as a case finding even
   when the aggregate is at least 80%; do not hide case findings or average away
   schema/invariant failures. EVAL-024 has no response-layer score and is reported as a
   provider-behavior result.
7. **Harness/evidence**: An independent Node script executes the same typecheck, build, test,
   evaluation, and evidence-integrity checks on every run. It records commands, outcomes,
   per-layer results, logs, synthetic provider outputs, and SHA-256 manifests in new
   write-once paths. Failures produce the specification's structured feedback. A repair is
   followed by the unchanged full matrix; final evidence includes a pending human decision.

## Project Structure

### Planning Artifacts

```text
specs/001-natural-language-reminder-agent/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── cli.md
```

### Planned Implementation Layout

```text
src/
├── cli.ts
├── application/
│   └── interpret.ts
├── providers/
│   ├── provider.ts
│   └── mock-provider.ts
├── validation/
│   ├── response-schema.ts
│   └── invariants.ts
└── evaluation/
    ├── cases.ts
    ├── semantic.ts
    └── run.ts

tests/
├── unit/
├── integration/
└── evaluation/

scripts/
└── harness.mjs

evidence/
├── initial/
├── repairs/
├── final/
└── human-decision.json
```

**Structure Decision**: One `src/` project with clear application, provider, validation, and
evaluation boundaries. The harness is a separate Node script and evidence is separate from
application data. The only CLI contract documents transport behavior and references the
approved request/response definitions in `spec.md`; no duplicate API schema is introduced in
planning.

## Requirement Traceability

Use the feature's existing FR-to-EVAL mapping in `spec.md` as the authoritative matrix. Each
implementation/test/evidence record carries the unchanged `FR-###` and `EVAL-###` IDs. The
harness checks that all 27 unique evaluation IDs appear once in the executable dataset and in
the per-case result set; a missing, duplicate, skipped, or unexpected case fails integrity.

| Requirement area | Implementation boundary | Evidence |
|---|---|---|
| FR-001–FR-016: request, clarification, time semantics, safety | `application/interpret.ts`; `validation/invariants.ts`; `providers/` | Unit and CLI integration outcomes, linked EVAL IDs |
| FR-005–FR-009, FR-019–FR-020: response validation | `validation/response-schema.ts`; `validation/invariants.ts` | Separate per-case schema and deterministic results |
| FR-017–FR-018: provider abstraction/failure | `providers/provider.ts`; `providers/mock-provider.ts` | Provider call/failure records, including EVAL-024 |
| FR-021–FR-023: cases, scoring, threshold | `evaluation/cases.ts`; `evaluation/semantic.ts`; `evaluation/run.ts` | All 27 case records, layer totals, 26-case score and threshold |
| FR-024–FR-026: feedback, repairs, privacy | `scripts/harness.mjs` | Write-once feedback, logs, hashes and repair-run manifests containing synthetic data only |
| FR-027: human accountability | Evidence decision record | Human-authored decision referencing final run ID |

## Complexity Tracking

No constitution violations or unnecessary architectural layers are proposed.
