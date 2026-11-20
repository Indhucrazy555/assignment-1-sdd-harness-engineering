# Quickstart: Natural-Language Reminder Agent

This guide covers the planned local setup and deterministic validation workflow. It requires
Node.js 24.x and npm. No model API key or network access is required for tests, evaluation, or
the harness.

## Setup

From `Part-1B`:

```powershell
node.exe --version
npm.cmd ci
```

Use `npm ci` in shells where the `npm` command is available directly. On Windows PowerShell in
this workspace, use `npm.cmd` to avoid the blocked `npm.ps1` shim.

## Build and Typecheck

```powershell
npm.cmd run typecheck
npm.cmd run build
```

Expected result: strict TypeScript checking and build complete without diagnostics.

## Tests

```powershell
npm.cmd test
```

Expected result: Node's built-in test runner executes unit, CLI integration, and evaluation
layer tests using deterministic providers. No test makes a network request or needs credentials.

## Run the Full 27-Case Evaluation

```powershell
npm.cmd run evaluate
```

Expected output reports, independently:

- the result and issues for each of the 27 stable case IDs;
- schema and deterministic pass rates (both must be 100%);
- semantic points and aggregate over the 26 JSON-response cases;
- the 80.00% threshold and overall `PASS`/`FAIL`;
- EVAL-024 provider-failure classification, separately from semantic scoring.

The evaluator retains only synthetic case inputs and provider outputs. It does not schedule,
send, or persist reminders.

## Full Harness and Evidence

Capture the initial implementation before any harness-driven repair:

```powershell
npm.cmd run harness -- --phase initial
```

After each genuine repair, run the unchanged full matrix and record a new repair round:

```powershell
npm.cmd run harness -- --phase repair --round 001
```

Capture the final candidate only after the unchanged full harness has completed:

```powershell
npm.cmd run harness -- --phase final
```

Each invocation records the fixed commands, per-check results/logs, evaluation layers,
structured failures when present, and SHA-256 manifests in a new write-once evidence path.
Failures remain failures; missing or skipped checks are not PASS. A final automated PASS is
still pending human review.

## Human Decision

Review the final run and its immutable evidence. A human—not the harness—records `ACCEPT` or
`REJECT`, reviewer identity, timestamp, rationale, and final run ID in the decision record.
Do not treat evaluation PASS as acceptance.
