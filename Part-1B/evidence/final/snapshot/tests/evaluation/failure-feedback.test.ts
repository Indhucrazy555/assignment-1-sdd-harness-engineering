import { strict as assert } from "node:assert";
import { test } from "node:test";
import type {
  CaseExecution,
  EvaluationCaseExecutor,
  EvaluationRun,
} from "../../src/contracts/types.js";
import {
  createFailureFeedback,
  validateFailureFeedback,
} from "../../src/evaluation/feedback.js";
import { evaluationCases } from "../../src/evaluation/cases.js";
import { runEvaluation } from "../../src/evaluation/run.js";

const evidenceReferences = {
  results: "evidence/repairs/round-001/results.json",
  logs: "evidence/repairs/round-001/evaluation.log",
};

async function runSingleCase(
  caseId: string,
  execute: EvaluationCaseExecutor,
): Promise<EvaluationRun> {
  const evaluationCase = evaluationCases.find((item) => item.caseId === caseId);
  if (!evaluationCase) {
    throw new Error(`${caseId} fixture is missing.`);
  }
  return runEvaluation([evaluationCase], execute);
}

test("builds structured schema feedback with expected, observed, and evidence details", async () => {
  const evaluationCase = evaluationCases[0];
  if (
    !evaluationCase ||
    evaluationCase.providerBehavior.kind !== "response" ||
    typeof evaluationCase.providerBehavior.response !== "object" ||
    evaluationCase.providerBehavior.response === null ||
    Array.isArray(evaluationCase.providerBehavior.response)
  ) {
    throw new Error("EVAL-001 response fixture is missing.");
  }
  const observed = {
    ...(evaluationCase.providerBehavior.response as Record<string, unknown>),
    unexpected: "synthetic schema failure",
  };
  const execute: EvaluationCaseExecutor = async (): Promise<CaseExecution> => ({
    providerOutcome: "response",
    response: observed,
  });
  const run = await runSingleCase(evaluationCase.caseId, execute);
  const feedback = createFailureFeedback(run, evidenceReferences);

  assert.equal(feedback.length, 1);
  const item = feedback[0];
  assert.equal(item?.runId, run.runId);
  assert.deepEqual(item?.caseIds, ["EVAL-001"]);
  assert.equal(item?.layer, "schema");
  assert.equal(item?.failureKind, "structural");
  assert.match(item?.expectedBehavior ?? "", /ready/i);
  assert.match(item?.observedBehavior ?? "", /schema/i);
  assert.deepEqual(item?.originalResponse, observed);
  assert.deepEqual(item?.evidenceReferences, evidenceReferences);
  assert.equal(validateFailureFeedback(item).valid, true);
  assert.equal(
    JSON.stringify(item).includes(
      "Remind me to call Rahul tomorrow at 10 AM.",
    ),
    false,
  );
});

test("classifies unexpected provider results and rejects sensitive or incomplete feedback", async () => {
  const unexpected = { fabricated: true };
  const execute: EvaluationCaseExecutor = async (): Promise<CaseExecution> => ({
    providerOutcome: "response",
    response: unexpected,
  });
  const run = await runSingleCase("EVAL-024", execute);
  const feedback = createFailureFeedback(run, evidenceReferences);

  assert.equal(feedback.length, 1);
  assert.equal(feedback[0]?.layer, "provider");
  assert.equal(feedback[0]?.failureKind, "provider");
  assert.deepEqual(feedback[0]?.originalResponse, unexpected);
  assert.equal(validateFailureFeedback(feedback[0]).valid, true);

  const secretFeedback = {
    ...feedback[0],
    observedBehavior: "provider returned sk_live_12345678901234567890",
  };
  assert.equal(validateFailureFeedback(secretFeedback).valid, false);

  const incompleteFeedback = {
    ...feedback[0],
    evidenceReferences: { results: "", logs: "" },
  };
  assert.equal(validateFailureFeedback(incompleteFeedback).valid, false);
});
