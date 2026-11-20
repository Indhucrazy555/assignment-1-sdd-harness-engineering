# Tasks: Natural-Language Reminder Agent

**Input**: Design documents in `specs/001-natural-language-reminder-agent/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, and
`contracts/cli.md`

**Organization**: Setup and shared validation foundations precede the three P1 user stories.
The user stories are executed sequentially to avoid conflicts in the shared application and
evaluation files. All 27 approved evaluation IDs remain unchanged.

**Tests**: Automated unit, CLI integration, evaluation, and traceability tests are required by
the assignment and constitution. Add tests before their corresponding implementation tasks.

## Phase 1: Setup

**Purpose**: Establish the minimal Node.js 24 and strict TypeScript project.

- [X] T001 Initialize `package.json`, `package-lock.json`, `tsconfig.json`, and `.gitignore` with Node.js 24 scripts for build, typecheck, tests, evaluation, and harness execution; use only the planned Ajv, `ajv-formats`, TypeScript, and `@types/node` dependencies.

## Phase 2: Foundational

**Purpose**: Build shared types, validation layers, provider fixtures, evaluation, and traceability
required by every user story.

- [X] T002 Define request, response, provider, layer-result, and evaluation-run types in `src/contracts/types.ts`, using the canonical fields in `data-model.md`: `ReminderRequest.text`, `ReminderRequest.referenceDateTime`, `ReminderRequest.timeZone`, `ReminderInterpretation.schemaVersion`, `ReminderInterpretation.status`, `ReminderInterpretation.reminder`, `ReminderInterpretation.clarificationQuestions`, `ReminderInterpretation.reason`, `Reminder.title`, `Reminder.recipient`, `Reminder.scheduledAt`, and `Reminder.timeZone`.
- [X] T003 Add structural-validation tests in `tests/unit/schema-validator.test.ts` for all three status branches, required and unknown properties, and invalid field types; reference `data-model.md`: `ReminderInterpretation.schemaVersion`, `ReminderInterpretation.status`, `ReminderInterpretation.reminder`, `ReminderInterpretation.clarificationQuestions`, `ReminderInterpretation.reason`, `Reminder.title`, `Reminder.recipient`, `Reminder.scheduledAt`, and `Reminder.timeZone`.
- [X] T004 Implement the Draft 2020-12 Ajv validator and response-schema definition in `src/validation/response-schema.ts`; keep it aligned with the approved schema in `spec.md` and pass `tests/unit/schema-validator.test.ts`. Use the canonical fields in `data-model.md`: `ReminderInterpretation.schemaVersion`, `ReminderInterpretation.status`, `ReminderInterpretation.reminder`, `ReminderInterpretation.clarificationQuestions`, `ReminderInterpretation.reason`, `Reminder.title`, `Reminder.recipient`, `Reminder.scheduledAt`, and `Reminder.timeZone`.
- [X] T005 Add deterministic-invariant tests in `tests/unit/invariants.test.ts` for status consistency, real canonical UTC instants, IANA-zone validity, and future-time ordering; reference `data-model.md`: `ReminderInterpretation.status`, `ReminderInterpretation.reminder`, `ReminderInterpretation.clarificationQuestions`, `ReminderInterpretation.reason`, `Reminder.recipient`, `Reminder.scheduledAt`, and `Reminder.timeZone`.
- [X] T006 Implement the independent invariant checks in `src/validation/invariants.ts` and pass `tests/unit/invariants.test.ts`; use the canonical definitions in `data-model.md`: `ReminderInterpretation.status`, `ReminderInterpretation.reminder`, `ReminderInterpretation.clarificationQuestions`, `ReminderInterpretation.reason`, `Reminder.recipient`, `Reminder.scheduledAt`, and `Reminder.timeZone`.
- [X] T007 Add an evaluation-inventory test in `tests/evaluation/case-inventory.test.ts` that requires the 27 approved case IDs exactly once and verifies each case has request/context, provider behavior, expected outcome, and semantic expectations; reference `data-model.md`: `EvaluationCase.caseId`, `EvaluationCase.request/context`, `EvaluationCase.providerBehavior`, `EvaluationCase.expected status and key fields`, and `EvaluationCase.scoring expectations`.
- [X] T008 Encode all 27 existing cases without changing their inputs, contexts, IDs, or expected outcomes in `src/evaluation/cases.ts`; include controlled mock behavior for provider-invoking cases, explicit no-call behavior for EVAL-023, EVAL-026, and EVAL-027, and the controlled provider error for EVAL-024. Reference `data-model.md`: `EvaluationCase.caseId`, `EvaluationCase.request/context`, `EvaluationCase.providerBehavior`, `EvaluationCase.expected status and key fields`, and `EvaluationCase.scoring expectations`.
- [X] T009 Add provider-interface and mock-provider tests in `tests/unit/provider.test.ts` for deterministic case-keyed responses, explicit no-call cases, unknown-case errors, and EVAL-024 provider failure; reference `data-model.md`: `ReminderProvider` and `EvaluationCase.caseId`, `EvaluationCase.providerBehavior`.
- [X] T010 Implement `ReminderProvider`, typed provider failures, and deterministic `MockProvider` in `src/providers/provider.ts` and `src/providers/mock-provider.ts`; make unconfigured cases fail explicitly and pass `tests/unit/provider.test.ts`. Reference `data-model.md`: `ReminderRequest.text`, `ReminderRequest.referenceDateTime`, `ReminderRequest.timeZone`, `ReminderProvider`, and `EvaluationCase.caseId`.
- [X] T011 Add evaluation-runner tests in `tests/evaluation/evaluation-runner.test.ts` that verify separate schema, deterministic, and semantic results; all 27 case records; the 26-response/130-point denominator; at least 104 semantic points (80.00%); 100% schema and 100% deterministic-invariant gates; and EVAL-024 as a provider check with no semantic score. Reference `data-model.md`: `LayerResult` and `EvaluationRun`.
- [X] T012 Implement the three-layer evaluator and per-case reporting in `src/evaluation/run.ts` and `src/evaluation/semantic.ts`; fail on any schema/invariant failure or semantic score below 80.00%, report every case finding, and keep EVAL-024 separate from the 26 semantic cases. Pass `tests/evaluation/evaluation-runner.test.ts`. Reference `data-model.md`: `LayerResult` and `EvaluationRun`.
- [X] T013 Add traceability tests in `tests/evaluation/traceability.test.ts` requiring each FR-001–FR-027 to map to one or more unchanged EVAL IDs and every EVAL ID to appear in the executable dataset and run results.
- [X] T014 Implement the per-requirement-to-case mapping in `src/evaluation/traceability.ts` from the existing traceability table in `spec.md`; expand ranges without changing coverage and pass `tests/evaluation/traceability.test.ts`.

**Checkpoint**: Shared contracts, both independent validators, deterministic provider, evaluation
inventory, three-layer evaluator, and full FR-to-EVAL traceability are ready.

## Phase 3: User Story 1 - Interpret a Clear Reminder (Priority: P1, MVP)

**Goal**: Return a validated ready interpretation for clear requests using explicit context and
controlled provider output.

**Independent Test**: Run EVAL-001–EVAL-006 with the mock provider. Verify expected title and
recipient, exact UTC instants, valid schema and invariants, repeatability, and no reminder
side effect.

- [X] T015 [US1] Add clear-request tests in `tests/evaluation/clear-reminder.test.ts` for EVAL-001–EVAL-006, including repeated identical evaluation; reference `data-model.md`: `ReminderRequest.text`, `ReminderRequest.referenceDateTime`, `ReminderRequest.timeZone`, `ReminderInterpretation.status`, `Reminder.title`, `Reminder.recipient`, `Reminder.scheduledAt`, and `Reminder.timeZone`.
- [X] T016 [US1] Implement the ready-result path and JSON CLI composition in `src/application/interpret.ts` and `src/cli.ts`; validate provider output before returning it, use only supplied context, and pass `tests/evaluation/clear-reminder.test.ts`. Reference `data-model.md`: `ReminderRequest.text`, `ReminderRequest.referenceDateTime`, `ReminderRequest.timeZone`, `ReminderInterpretation.status`, `Reminder.title`, `Reminder.recipient`, `Reminder.scheduledAt`, and `Reminder.timeZone`.

## Phase 4: User Story 2 - Clarify Incomplete or Ambiguous Requests (Priority: P1)

**Goal**: Preserve clarification status and questions without inventing unresolved reminder
details or implicit date/time context.

**Independent Test**: Run EVAL-007–EVAL-014 and EVAL-026–EVAL-027. Verify relevant clarification
questions, null unresolved fields, and no provider call for the two missing-context cases.

- [X] T017 [US2] Add clarification tests in `tests/evaluation/clarification.test.ts` for EVAL-007–EVAL-014 and EVAL-026–EVAL-027; verify missing/ambiguous time, date, recipient, intent, DST cases, and missing reference/time-zone context. Reference `data-model.md`: `ReminderInterpretation.status`, `ReminderInterpretation.reminder`, `ReminderInterpretation.clarificationQuestions`, `Reminder.title`, `Reminder.recipient`, `Reminder.scheduledAt`, and `Reminder.timeZone`.
- [X] T018 [US2] Implement clarification handling in `src/application/interpret.ts` and `src/providers/mock-provider.ts` for the specified cases, preserving unresolved nulls and no-call behavior without substituting system time, locale, or zone; pass `tests/evaluation/clarification.test.ts`. Reference `data-model.md`: `ReminderRequest.referenceDateTime`, `ReminderRequest.timeZone`, `ReminderInterpretation.status`, `ReminderInterpretation.reminder`, `ReminderInterpretation.clarificationQuestions`, `Reminder.title`, `Reminder.recipient`, `Reminder.scheduledAt`, and `Reminder.timeZone`.

## Phase 5: User Story 3 - Safely Reject Unsupported Requests (Priority: P1)

**Goal**: Reject malformed, unsupported, or unsafe requests and keep provider failures distinct;
never perform or claim a reminder side effect.

**Independent Test**: Run EVAL-015–EVAL-023 and EVAL-025 as rejection/input cases; run EVAL-024
separately as an expected provider failure. Verify schema-valid rejection responses where
specified, no fabricated model output for EVAL-024, and zero side effects.

- [X] T019 [US3] Add rejection and provider-failure tests in `tests/evaluation/rejection-safety.test.ts` for EVAL-015–EVAL-023 and EVAL-025, plus a separate EVAL-024 provider-result assertion; verify no reminder side effects and do not include EVAL-024 in semantic scoring. Reference `data-model.md`: `ReminderInterpretation.status`, `ReminderInterpretation.reminder`, `ReminderInterpretation.clarificationQuestions`, `ReminderInterpretation.reason`, `EvaluationCase.caseId`, and `EvaluationRun`.
- [X] T020 [US3] Implement malformed/context rejection, unsupported and adversarial handling, and distinct provider-failure propagation in `src/application/interpret.ts`, `src/providers/mock-provider.ts`, and `src/cli.ts`; pass `tests/evaluation/rejection-safety.test.ts` without fabricating a response or performing side effects. Reference `data-model.md`: `ReminderRequest.text`, `ReminderRequest.referenceDateTime`, `ReminderRequest.timeZone`, `ReminderInterpretation.status`, `ReminderInterpretation.reminder`, `ReminderInterpretation.clarificationQuestions`, `ReminderInterpretation.reason`, and `EvaluationCase.caseId`.

## Phase 6: Harness, Evidence, and Human Review

**Purpose**: Preserve original outputs and failure history, rerun the unchanged suite after every
repair, and leave the final acceptance decision to a human.

- [X] T021 Add tests in `tests/evaluation/failure-feedback.test.ts` for structured feedback fields, case/layer classification, expected versus observed behavior, evidence references, and absence of secrets/live user data; reference `data-model.md`: `FailureFeedback`.
- [X] T022 Implement structured failure feedback and its validation in `src/evaluation/feedback.ts`; include run ID, affected case IDs, layer, expected/observed behavior, failure kind, original synthetic response when present, and evidence references; pass `tests/evaluation/failure-feedback.test.ts`. Reference `data-model.md`: `FailureFeedback` and `EvaluationRun`.
- [X] T023 Implement the independent full-check orchestrator in `scripts/harness.mjs` and its integration tests in `tests/integration/harness.test.ts`; run typecheck, build, all automated tests, all 27 evaluations, and evidence-integrity checks; retain per-check logs/results and write-once SHA-256 manifests under `evidence/`.
- [ ] T024 Before any harness-driven repair, capture the immutable initial implementation snapshot and run the complete unchanged harness; preserve the snapshot, all check results, logs, synthetic provider outputs, and manifest under `evidence/initial/`.
- [ ] T025 For every genuine repair, use only evidence-backed feedback and rerun the unchanged complete check matrix; preserve each repair round, full results, logs, and manifests in a new `evidence/repairs/round-NNN/` directory without editing prior evidence or weakening requirements.
- [ ] T026 After repairs are complete, run the unchanged full harness and preserve the final implementation snapshot, complete results, logs, and manifest under `evidence/final/`; report actual failures and leave the decision pending.
- [ ] T027 After reviewing the final run, have a human record explicit ACCEPT or REJECT, reviewer identity, timestamp, rationale, and final run ID in `evidence/human-decision.json`; do not prefill or automatically generate the decision.

## Dependencies and Execution Order

### Phase Dependencies

- Setup T001 precedes all work.
- Foundational T002–T014 are sequential prerequisites for the user stories.
- User stories are executed in order: US1 (T015–T016), US2 (T017–T018), then US3 (T019–T020).
- Harness/evidence work follows the three stories; T024 must precede any repair, every T025 repair run uses the unchanged full matrix, and T026 follows all repairs.
- T027 is a human-only decision task after final evidence review.

### Traceability

`src/evaluation/traceability.ts` and `tests/evaluation/traceability.test.ts` preserve the existing
FR-to-EVAL mappings in `spec.md`. The evaluator records all 27 case IDs and links each result to
its mapped requirements. EVAL-024 is recorded as provider behavior only; the other 26 response
cases determine the semantic aggregate.

### Parallel Opportunities

No tasks are marked `[P]`. The project is a single-student assignment and the shared application,
provider fixtures, evaluation, and evidence chain are intentionally sequential to avoid
conflicting edits and preserve baseline order.

## Implementation Strategy

1. Complete setup and foundational validation/provider/evaluation work.
2. Deliver US1 as the MVP and validate EVAL-001–EVAL-006 independently.
3. Add US2 clarification behavior and validate its assigned cases.
4. Add US3 rejection/provider-failure behavior and validate its assigned cases.
5. Complete traceability and structured feedback, then capture the initial snapshot before
   repairs.
6. Apply only genuine repairs; rerun the unchanged full harness after each one.
7. Capture final evidence and request human ACCEPT/REJECT review. No task creates a decision
   automatically.

Use the commands defined in `quickstart.md`: `npm run typecheck`, `npm run build`, `npm test`,
`npm run evaluate`, and `npm run harness -- --phase <initial|repair|final>`.
