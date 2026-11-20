# CLI Contract

This document defines only the transport boundary for local use. The normative request fields,
response fields, status behavior, validation, and date/time rules remain those in
[spec.md](../spec.md); this document does not duplicate or amend that contract.

## Request

- Read exactly one UTF-8 JSON object from standard input.
- Accept only the request properties defined by the input contract in `spec.md`.
- Do not read a default date, time zone, or recipient from process/environment state.
- Do not log request content or credentials.

## Successful Interpretation Response

For a valid JSON request that produces an interpretation, write exactly one response-schema
JSON object followed by a newline to standard output and exit with code `0`. This includes
`ready`, `needs_clarification`, and schema-valid `rejected` outcomes.

## Failures Outside the Response Contract

Transport, provider, and internal application failures are not reminder responses. Write a
sanitized diagnostic to standard error and use distinct nonzero exit codes:

| Failure | Exit code | Behavior |
|---|---:|---|
| Invalid JSON transport input | 2 | Report an input failure; write no response to stdout |
| Provider unavailable/error | 3 | Report a provider failure; do not fabricate a response |
| Unexpected application failure | 1 | Report an application failure without exposing secrets or user text |

Parseable objects with invalid request fields follow the approved specification: return a
schema-valid `rejected` response when required by FR-015, rather than treating them as a
transport parse failure.

Automated tests and evaluation inject the deterministic mock provider directly. No live model
adapter or API credential is required by this contract.
