import { strict as assert } from "node:assert";
import { test } from "node:test";
import type {
  CaseExecution,
  EvaluationCase,
  EvaluationCaseExecutor,
  ReminderRequest,
} from "../../src/contracts/types.js";
import {
  interpretReminder,
} from "../../src/application/interpret.js";
import { evaluationCases } from "../../src/evaluation/cases.js";
import { runEvaluation } from "../../src/evaluation/run.js";
import {
  ProviderError,
  type ReminderProvider,
} from "../../src/providers/provider.js";
import { MockProvider } from "../../src/providers/mock-provider.js";
import { validateInvariants } from "../../src/validation/invariants.js";
import { validateResponse } from "../../src/validation/response-schema.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireCase(caseId: string): EvaluationCase {
  const evaluationCase = evaluationCases.find((item) => item.caseId === caseId);
  if (!evaluationCase) {
    throw new Error(`${caseId} fixture is missing.`);
  }
  return evaluationCase;
}

function requireRequest(value: unknown): ReminderRequest {
  if (!isRecord(value) || typeof value.text !== "string") {
    throw new Error("Evaluation request fixture is malformed.");
  }
  return {
    text: value.text,
    ...(typeof value.referenceDateTime === "string"
      ? { referenceDateTime: value.referenceDateTime }
      : {}),
    ...(typeof value.timeZone === "string" ? { timeZone: value.timeZone } : {}),
  };
}

test("returns schema-valid rejections for unsupported and unsafe cases", async () => {
  const callIds: string[] = [];
  const mockProvider = new MockProvider();
  const provider: ReminderProvider = {
    async interpret(request, context) {
      if (context?.caseId) {
        callIds.push(context.caseId);
      }
      return mockProvider.interpret(request, context);
    },
  };
  const responseCases = [
    "EVAL-015",
    "EVAL-016",
    "EVAL-017",
    "EVAL-018",
    "EVAL-019",
    "EVAL-020",
    "EVAL-021",
    "EVAL-022",
    "EVAL-023",
    "EVAL-025",
  ];

  for (const caseId of responseCases) {
    const evaluationCase = requireCase(caseId);
    const response = await interpretReminder(
      evaluationCase.input,
      provider,
      { caseId },
    );
    assert.equal(response.status, "rejected", caseId);
    assert.equal(response.reminder, null, caseId);
    assert.deepEqual(response.clarificationQuestions, [], caseId);
    assert.equal(validateResponse(response).valid, true, caseId);
    assert.equal(validateInvariants(response, evaluationCase.input).valid, true, caseId);
    if (evaluationCase.expected.kind !== "response") {
      throw new Error(`${caseId} expected response fixture is missing.`);
    }
    assert.equal(response.reason, evaluationCase.expected.fields.reason, caseId);
    if (evaluationCase.providerBehavior.kind === "response") {
      assert.deepEqual(response, evaluationCase.providerBehavior.response);
    }
  }

  assert.deepEqual(callIds, [
    "EVAL-015",
    "EVAL-016",
    "EVAL-019",
    "EVAL-020",
    "EVAL-021",
  ]);
});

test("reports EVAL-024 as a provider failure with no fabricated response", async () => {
  const evaluationCase = requireCase("EVAL-024");
  let callCount = 0;
  const mockProvider = new MockProvider();
  const provider: ReminderProvider = {
    async interpret(request, context) {
      callCount += 1;
      return mockProvider.interpret(request, context);
    },
  };

  await assert.rejects(
    interpretReminder(
      requireRequest(evaluationCase.input),
      provider,
      { caseId: evaluationCase.caseId },
    ),
    (error: unknown) =>
      error instanceof ProviderError &&
      error.code === "PROVIDER_UNAVAILABLE",
  );
  assert.equal(callCount, 1);

  const executor: EvaluationCaseExecutor = async (item): Promise<CaseExecution> => {
    try {
      const response = await interpretReminder(
        requireRequest(item.input),
        new MockProvider(),
        { caseId: item.caseId },
      );
      return { providerOutcome: "response", response };
    } catch (error) {
      if (error instanceof ProviderError) {
        return {
          providerOutcome: "failure",
          response: null,
          errorCode: error.code,
          failureKind: "provider",
        };
      }
      throw error;
    }
  };
  const run = await runEvaluation([evaluationCase], executor);
  const result = run.cases[0];
  assert.equal(result?.providerOutcome, "failure");
  assert.equal(result?.providerCheck, "PASS");
  assert.equal(result?.response, null);
  assert.equal(
    result?.layers.some((layer) => layer.points !== undefined),
    false,
  );
  assert.equal(
    result?.layers.every((layer) => layer.outcome === "NOT_APPLICABLE"),
    true,
  );
});
