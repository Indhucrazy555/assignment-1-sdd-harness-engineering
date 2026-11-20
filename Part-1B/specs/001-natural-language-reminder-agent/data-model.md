# Data Model: Natural-Language Reminder Agent

The approved schema and requirements in [spec.md](./spec.md) are normative. This document
describes the implementation-facing entities and validation boundaries without redefining
their field constraints.

## Runtime Entities

### ReminderRequest

One parsed input object:

- `text`: required reminder request text.
- `referenceDateTime`: optional canonical UTC instant; absence requires clarification.
- `timeZone`: optional IANA identifier; absence requires clarification.

The input boundary rejects unknown properties and malformed supplied values according to
FR-001–FR-004 and the input contract in `spec.md`.

### ReminderInterpretation

One schema-versioned response:

- `schemaVersion`
- `status`: `ready`, `needs_clarification`, or `rejected`
- `reminder`: null or the specified reminder value
- `clarificationQuestions`
- `reason`

The exact field types, extra-property policy, and status combinations are defined only by the
approved response schema and FR-005–FR-014 in `spec.md`.

### Reminder

A non-null interpretation payload with:

- `title`
- `recipient`
- `scheduledAt`
- `timeZone`

It represents interpreted intent only; it is not a scheduled, delivered, or persisted reminder.
For clarification responses, known values may be retained and unresolved values remain null.

### ReminderProvider

An application dependency with one operation that accepts a validated request/context and
returns untrusted `unknown` output. Provider errors are represented distinctly and never
replaced with a fabricated response. The mock implementation is deterministic and is keyed to
the evaluation case ID.

## Evaluation Entities

### EvaluationCase

One stable specification case, keyed by its unchanged `EVAL-###` ID:

- request and supplied context (including intentional missing/invalid values)
- controlled provider behavior: response fixture, explicit no-call, or EVAL-024 provider error
- expected status and key fields
- expected schema/invariant outcomes
- semantic scoring expectations tied to the approved 0–5 rubric

The evaluation inventory contains exactly the existing 27 IDs from `spec.md`; the executable
fixture data must be checked against that inventory.

### LayerResult

One independently reported result for a case and one layer:

- layer: `schema`, `deterministic`, or `semantic`
- pass/fail or semantic points, as applicable
- named issues and expected/observed detail

Provider, input, and application failures are reported in their own failure category and do not
masquerade as a validation-layer result.

### EvaluationRun

One immutable run record containing:

- unique run identifier and timestamps
- all 27 case identifiers and observed provider interactions
- original synthetic output when present
- per-case schema, deterministic, and semantic results when a JSON response exists; EVAL-024
  instead records those response layers as not applicable and records its provider result
- semantic aggregate and 80.00% threshold
- provider/input/application failures
- overall `PASS` or `FAIL` and evidence references

The semantic denominator is 26 JSON-response cases × 5 points; EVAL-024 is an expected
provider-failure check, not a JSON response or semantic score.

### FailureFeedback

A machine-readable record for failed cases/runs with the run ID, affected case IDs, layer,
expected and observed behavior, failure kind, original output when present, and immutable
evidence references. It contains synthetic data only and cannot authorize changing evaluation
expectations.

## State and Relationships

- A `ReminderRequest` is passed to the application, which invokes at most one
  `ReminderProvider` operation for its interpretation.
- A completed provider value is checked by schema validation, deterministic invariants, and
  (during evaluation) semantic comparison. These layers remain independent.
- Each `EvaluationCase` contributes one row to an `EvaluationRun`; the provider-failure case
  contributes to provider handling, not the semantic denominator.
- A failed run can produce `FailureFeedback`; repair runs are separate immutable records.
- A final `EvaluationRun` may be referenced by a human decision, but the run cannot create that
  decision automatically.

## Validation and Retention

- The response schema is the only authority for structural shape.
- Deterministic checks independently enforce calendar reality, canonical UTC representation,
  IANA zone validity, future ordering, and status invariants.
- Semantic comparison uses the case's expected status/fields and approved rubric.
- Application memory is transient. Only synthetic requests/responses and the minimum run data
  needed for assignment evidence are retained.
- No user reminder store, database, scheduling state, or notification state exists.
