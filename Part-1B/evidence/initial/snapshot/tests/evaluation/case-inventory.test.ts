import { strict as assert } from "node:assert";
import { test } from "node:test";
import { evaluationCases } from "../../src/evaluation/cases.js";

test("contains every approved evaluation case exactly once in order", () => {
  const expectedIds = Array.from({ length: 27 }, (_, index) =>
    `EVAL-${String(index + 1).padStart(3, "0")}`,
  );
  assert.deepEqual(
    evaluationCases.map((evaluationCase) => evaluationCase.caseId),
    expectedIds,
  );
});

test("separates provider failure from the 26 response cases", () => {
  const providerFailure = evaluationCases.find(
    (evaluationCase) => evaluationCase.caseId === "EVAL-024",
  );
  assert.equal(providerFailure?.expected.kind, "provider_failure");
  assert.equal(
    evaluationCases.filter(
      (evaluationCase) => evaluationCase.expected.kind === "response",
    ).length,
    26,
  );
});

test("marks the specified pre-provider cases explicitly", () => {
  const noCallIds = evaluationCases
    .filter((evaluationCase) => evaluationCase.providerBehavior.kind === "not_called")
    .map((evaluationCase) => evaluationCase.caseId);
  assert.deepEqual(noCallIds, [
    "EVAL-017",
    "EVAL-018",
    "EVAL-022",
    "EVAL-023",
    "EVAL-025",
    "EVAL-026",
    "EVAL-027",
  ]);
});

test("gives every case input, provider behavior, and expected outcome", () => {
  assert.equal(
    evaluationCases.every(
      (evaluationCase) =>
        evaluationCase.input !== undefined &&
        evaluationCase.providerBehavior !== undefined &&
        evaluationCase.expected !== undefined,
    ),
    true,
  );
});
