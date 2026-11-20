import { strict as assert } from "node:assert";
import { test } from "node:test";
import { evaluationCases } from "../../src/evaluation/cases.js";
import { runEvaluation } from "../../src/evaluation/run.js";
import {
  requirementToEvaluationCases,
  requirementsForCase,
} from "../../src/evaluation/traceability.js";

test("maps every functional requirement to at least one approved case", () => {
  const expectedRequirements = Array.from({ length: 27 }, (_, index) =>
    `FR-${String(index + 1).padStart(3, "0")}`,
  );
  assert.deepEqual(
    Object.keys(requirementToEvaluationCases),
    expectedRequirements,
  );
  for (const [requirementId, caseIds] of Object.entries(
    requirementToEvaluationCases,
  )) {
    assert.ok(caseIds.length > 0, `${requirementId} has no evaluation coverage`);
  }
});

test("references only the preserved evaluation case inventory", () => {
  const actualCaseIds = new Set(
    evaluationCases.map((evaluationCase) => evaluationCase.caseId),
  );
  const mappedCaseIds = new Set(
    Object.values(requirementToEvaluationCases).flat(),
  );
  assert.deepEqual([...mappedCaseIds].sort(), [...actualCaseIds].sort());
});

test("retains provider-failure and human-review traceability", () => {
  assert.ok(requirementToEvaluationCases["FR-017"]?.includes("EVAL-024"));
  assert.ok(requirementToEvaluationCases["FR-018"]?.includes("EVAL-024"));
  assert.ok(requirementToEvaluationCases["FR-024"]?.includes("EVAL-024"));
  assert.deepEqual(
    requirementToEvaluationCases["FR-027"],
    evaluationCases.map((evaluationCase) => evaluationCase.caseId),
  );
});

test("links run results to requirements and adds failure-feedback requirements dynamically", async () => {
  const evaluationCase = evaluationCases[0];
  if (!evaluationCase || evaluationCase.providerBehavior.kind !== "response") {
    throw new Error("EVAL-001 response fixture is missing.");
  }
  const response = evaluationCase.providerBehavior.response;
  const run = await runEvaluation([evaluationCase], async () => ({
    providerOutcome: "response",
    response:
      typeof response === "object" && response !== null && !Array.isArray(response)
        ? { ...response, unexpected: true }
        : response,
  }));
  const result = run.cases[0];

  assert.ok(result?.requirementIds.includes("FR-001"));
  assert.ok(result?.requirementIds.includes("FR-005"));
  assert.ok(result?.requirementIds.includes("FR-024"));
  assert.ok(result?.requirementIds.includes("FR-025"));
  assert.ok(requirementsForCase("EVAL-001", ["EVAL-001"]).includes("FR-024"));
  assert.ok(requirementsForCase("EVAL-001").includes("FR-001"));
  assert.equal(requirementToEvaluationCases["FR-024"]?.includes("EVAL-001"), false);
});
