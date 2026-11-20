# Harness Execution and Repair Log

## Initial run

- Run ID: `4344f3ec-7ada-4189-bf0d-96e4c3a6dd22`
- Outcome: PASS
- Typecheck, build, tests, and evaluation: 4/4 PASS.
- Evaluation: 27 cases accounted for; semantic score 100%; schema pass rate 100%; deterministic pass rate 100%.
- No failing check was recorded in the initial results.

## Portability correction

- File changed: `scripts/harness.mjs`
- Change: Windows subprocess execution was updated to invoke `npm.cmd` through `ComSpec/cmd.exe`. Non-Windows execution continues to invoke npm directly.
- Scope: Process invocation only. No evaluation cases, acceptance criteria, or thresholds were changed.
- Classification: Windows portability correction. The preserved initial results do not establish a failing check that triggered this change.

## Repair-round validation

- Run ID: `547ac049-a2f0-41f6-969f-85b0edb98201`
- Outcome: PASS
- Typecheck, build, tests, and evaluation: 4/4 PASS.
- EVAL-024: Provider failure scenario; provider check PASS. Excluded from semantic scoring as specified.

## Final validation

- Run ID: `b10d38bc-1bac-46d8-8f58-8746ed180963`
- Outcome: PASS
- Typecheck, build, tests, and evaluation: 4/4 PASS.
- Human acceptance decision remains pending.

## Evidence integrity and disclosure

- The initial, repair-round, and final run records were generated and retained.
- During subsequent whitespace cleanup, some historical check log files were modified.
- As a result, manifest verification reported SHA-256 mismatches:
  - Initial evidence: `checks/build.log`, `checks/evaluation.log`, `checks/tests.log`, and `checks/typecheck.log`.
  - Repair-round evidence: `checks/build.log` and `checks/evaluation.log`.
  - Final evidence: `checks/build.log`, `checks/evaluation.log`, `checks/tests.log`, and `checks/typecheck.log`.
- These historical evidence directories must therefore not be described as fully integrity-verified.
- The original manifest files were not regenerated to conceal these mismatches.
- The supplemental validation evidence remains separately preserved and its manifest verification passed.
- No tests, evaluation cases, or acceptance thresholds were weakened.
- No initial harness failure is claimed because none appears in the recorded initial results.

## Supplemental validation — 20 November 2026

- Run ID: `4ff1a368-ee07-4fe4-9897-97901fc3c2bc`
- Evidence: `evidence/supplemental/run-001/`
- Typecheck: PASS
- Build: PASS
- Automated tests: 40 passed, 0 failed, 0 skipped.
- Evaluation cases: 27 total.
- Semantic cases: 26.
- Semantic score: 100% (130/130; threshold 80%).
- Schema pass rate: 100%.
- Deterministic pass rate: 100%.
- Provider failure case EVAL-024: handled separately as `PROVIDER_UNAVAILABLE`.
- Evidence integrity: PASS.
- Manifest verification: valid, no issues.

The supplemental run confirms that the standalone dataset matches the application's evaluation case inventory and that all validation checks pass.

This supplemental validation does not establish a genuine feedback-driven repair cycle or constitute the student's final acceptance decision. Those remain separate items requiring appropriate evidence and student review.