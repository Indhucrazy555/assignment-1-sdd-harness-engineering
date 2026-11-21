# Assignment 1 – Spec-Driven Development and Harness Engineering

This repository contains the two applications developed for **BITS Pilani – AI-Augmented Software Development Life Cycle (SE* ZG534), Assignment 1**.

The assignment demonstrates how Spec-Driven Development (SDD) and Harness Engineering can be applied to both deterministic and AI-augmented software systems.

## Assignment Overview

The assignment is divided into two parts.

### Part 1A – Smart Todo Management API

A deterministic task-management API built using TypeScript and Node.js.

**Key aspects:**
- Requirements and implementation guided by SDD artifacts.
- Strict TypeScript implementation.
- JSON-based persistence.
- Unit, integration, and contract testing.
- Automated harness checks covering syntax, linting, type checking, tests, coverage, and security auditing.
- Evidence captured for harness executions.

**Latest final run: 9/9 checks passed.**

Test results:
- 16 unit tests
- 8 integration tests
- 10 contract tests
- 91.03% statement coverage
- 90.54% branch coverage

**Security note:** The dependency audit identified four moderate vulnerabilities. This finding was retained and disclosed rather than bypassed or hidden.

### Part 1B – Natural-Language Reminder Agent

A TypeScript-based application that converts natural-language reminder requests into structured reminder data.

**Key aspects:**
- Requirements, constitution, specification, plan, and task artifacts.
- Structured output validation using JSON Schema.
- Deterministic and semantic evaluation checks.
- Handling of missing, ambiguous, malformed, and invalid inputs.
- Clarification instead of inventing missing information.
- Provider abstraction with a deterministic mock provider.
- Evaluation evidence and integrity verification.

**Latest supplemental validation: PASS; manifest verified.**

Evaluation results:
- 27 evaluation cases
- 26 semantic evaluation cases
- 130/130 semantic points
- 100% schema checks
- 100% deterministic checks
- 80% semantic threshold

The provider-failure scenario is evaluated separately.

**Human acceptance decision:** Pending. A passing validation result does not itself represent the final human acceptance decision.

## Development Approach

Both applications follow a Spec-Driven Development workflow:

1. Define the problem and requirements.
2. Establish the project constitution.
3. Create and clarify the specification.
4. Prepare the implementation plan.
5. Generate implementation tasks.
6. Implement the application.
7. Validate through automated harness checks.
8. Review feedback and make appropriate corrections.
9. Re-run validation and preserve execution evidence.
10. Retain human review as the final acceptance step.

## Repository Structure

The following is a selected view of the repository structure:

```text
assignment-1-sdd-harness-engineering/
│
├── Part-1A/
│   ├── src/
│   ├── tests/
│   ├── scripts/
│   ├── .harness/
│   └── evidence/
│
├── Part-1B/
│   ├── src/
│   ├── tests/
│   ├── scripts/
│   ├── specs/
│   ├── evals/
│   ├── evidence/
│   └── harness-log.md
│
└── README.md
```

Refer to the quickstart documentation within the respective project folders for setup and execution instructions.

## Evidence and Transparency

Harness outputs and evaluation evidence are retained in the respective project folders.

For Part 1B, historical evidence includes documented integrity limitations, including manifest hash mismatches in earlier runs. The latest supplemental run contains a verified manifest. These limitations are disclosed rather than silently rewriting historical evidence.

The Part 1B provider implementation uses a deterministic mock; it does not claim to be a live LLM integration.

## Submission

- **Source code:** Available in this GitHub repository.
- **Demo video:** The recording will be linked here after uploading to Google Drive or OneDrive.
- **Reflection report:** Submitted separately through the BITS Pilani LMS.

---

- **Course:** AI-Augmented Software Development Life Cycle
- **Assignment:** Assignment 1 – Spec-Driven Development & Harness Engineering
- **Institution:** BITS Pilani
