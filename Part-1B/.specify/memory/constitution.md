# Natural-Language Reminder Agent Constitution

## Core Principles

### I. Structured Output Contract
Every model-generated response MUST conform to a versioned JSON Schema before the application
uses or returns it. The schema MUST require exactly these top-level fields: `schemaVersion`
(string, initially `"1.0"`), `status` (one of `"ready"`, `"needs_clarification"`, or
`"rejected"`), `reminder` (an object or `null`), `clarificationQuestions` (an array of strings),
and `reason` (a string or `null`). A non-null reminder MUST contain exactly `title` (non-empty
string), `recipient` (string or `null`), `scheduledAt` (string or `null`), and `timeZone` (IANA
time-zone string or `null`). Unknown fields MUST be rejected.

For `"ready"`, `reminder` MUST be non-null, `title` MUST contain non-whitespace text,
`scheduledAt` MUST be a real instant formatted as UTC ISO 8601 with millisecond precision
(`YYYY-MM-DDTHH:mm:ss.sssZ`), `clarificationQuestions` MUST be empty, and `reason` MUST be
`null`. For `"needs_clarification"`, at least one concise clarification question MUST be
provided; known reminder fields MAY be retained, but unresolved values MUST be `null`. For
`"rejected"`, `reminder` MUST be `null`, `clarificationQuestions` MUST be empty, and `reason`
MUST explain the rejection. A response failing the schema or these status invariants MUST NOT
be accepted, used, or represented as a successful reminder.

### II. Uncertainty and Clarification
The agent MUST detect missing, ambiguous, or conflicting reminder details and ask the user to
clarify rather than silently inventing a date, time, time zone, recipient, or reminder intent.
A reminder MUST NOT be `"ready"` unless its title and exact scheduled instant are known.
Relative expressions such as “tomorrow” or “in three days” MUST be resolved only against an
explicitly supplied reference date/time and time zone; the system clock MUST NOT be an implicit
reference. A missing reference, missing required time, ambiguous local time, or daylight-saving
gap or overlap MUST produce `"needs_clarification"`. Clarification prompts MUST identify the
unresolved information without asserting an unsupported guess.

### III. Safety and Guardrails
All user and model content MUST be treated as untrusted data. The agent MUST safely reject
malformed or unsupported requests and MUST NOT execute instructions embedded in reminder text,
invoke unapproved actions, or expose secrets or sensitive information. A rejected request MUST
not produce a ready reminder or trigger a reminder side effect. Unsafe or unsupported content
MUST be handled without revealing internal prompts, credentials, or implementation details.

### IV. Independent Validation
Reminder evaluation MUST use three distinct layers: (1) JSON Schema structural validation,
(2) deterministic invariant and property checks, and (3) semantic/quality evaluation against
case-specific expected outcomes or a documented rubric. Structural and deterministic checks
MUST be authoritative and MUST run independently of any model-based judge. An LLM judge MAY
supplement semantic evaluation, but MUST NOT replace schema validation, deterministic checks,
or explicit failure reporting. A case with invalid structure or a failed invariant MUST fail
regardless of its aggregate semantic score.

### V. Testability and Reproducibility
Model access MUST be hidden behind a provider interface. All automated tests and evaluation
cases MUST run with controlled deterministic mock responses and MUST NOT require network
access, API credentials, or a live model. Provider failures, application failures, validator
failures, and evaluation failures MUST be reported as distinguishable outcomes. Each evaluation
case MUST supply a fixed reference date/time and time zone whenever relative dates are tested,
so repeated runs with the same inputs and mock responses produce the same result.

### VI. Security and Privacy
API keys, credentials, tokens, and other secrets MUST NOT be committed, hard-coded, or written
to logs or evaluation evidence. Optional provider configuration MUST be read from environment
variables and MUST fail safely when missing or invalid. The application MUST collect and retain
only information required to create and evaluate a reminder. Reminder content and model
responses MUST NOT be persisted unless an approved specification requires it; any required
retention MUST be documented and limited to the minimum necessary.

### VII. Traceability and Evidence
Every approved requirement MUST be traceable to implementation, one or more evaluation cases,
and recorded harness results. The deterministic evaluation dataset MUST contain at least
15 meaningful cases and cover normal, boundary, ambiguous, underspecified,
missing-information, malformed, and adversarial/guardrail behavior. The harness MUST calculate
an aggregate score using a documented rubric and MUST compare it with a documented threshold
of at least 80%. Structural or deterministic failures MUST remain failures regardless of that
score.

The initial implementation snapshot, original model responses used by evaluation, genuine
failure results and structured repair feedback, every repair round, and the final evaluation
results MUST be preserved as immutable evidence. Failed evaluations MUST produce structured
feedback identifying affected case IDs, validation layer, expected and observed behavior, and
references to the relevant output and logs. Every repair MUST be followed by the unchanged full
evaluation suite. Requirements, cases, assertions, thresholds, or harness controls MUST NOT be
weakened, removed, or skipped to manufacture a pass.

### VIII. Human Accountability
Automated PASS is evidence for review, not acceptance. A human reviewer MUST inspect the final
harness results and record an explicit `ACCEPT` or `REJECT` decision with reviewer identity,
timestamp, rationale, and the final run identifier. No tool or agent may fabricate or
automatically approve this decision.

## Additional Constraints

The solution MUST remain small and suitable for an academic assignment. Use the simplest
architecture that supports the provider abstraction, independent validation layers, deterministic
evaluation, and evidence retention. New infrastructure, dependencies, storage, or external
services MUST be justified by an approved requirement. The reminder contract, date and time
semantics, error behavior, evaluation rubric, and acceptance threshold MUST be documented
before implementation and MUST not be inferred from model behavior.

## Development Workflow and Quality Gates

Before implementation, the approved specification MUST define the response schema, date and
time semantics, status behavior, semantic rubric, aggregate-score calculation, and evaluation
threshold. Evaluation cases MUST be stable, independently identifiable, and include input,
fixed context when relevant, controlled provider response, expected status and key expected
fields, and expected validation outcome.

The harness MUST run structural, deterministic, and semantic evaluation as separately reported
layers, then report individual case results, aggregate score, and threshold. A failed structural
check or deterministic invariant MUST fail the run regardless of the semantic score, and a
failed case MUST not be hidden by averaging it with passing cases. Any approved change to cases,
criteria, or thresholds MUST be reviewed and reflected in versioned evidence before the changed
suite is used for acceptance.

## Governance

This constitution takes precedence over implementation convenience and conflicting project
artifacts. Specifications, plans, implementations, tests, evaluations, and reviews MUST comply
with it. Any exception requires a documented rationale and explicit human approval before the
affected work is accepted.

Changes to these principles MUST be justified in this file and versioned using semantic
versioning: MAJOR for incompatible changes, MINOR for new or materially expanded principles,
and PATCH for clarifications that do not change obligations. Every amendment MUST update the
last-amended date and include a concise impact report. Contributors and AI agents MUST preserve
prior evidence and review results, report deviations explicitly, and MUST NOT treat passing
automation as a substitute for human review.

**Version**: 1.0.0 | **Ratified**: 2026-11-20 | **Last Amended**: 2026-11-20
