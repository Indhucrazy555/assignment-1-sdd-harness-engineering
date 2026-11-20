import { strict as assert } from "node:assert";
import { test } from "node:test";
import type {
  EvaluationCase,
  ReminderRequest,
} from "../../src/contracts/types.js";
import { interpretReminder } from "../../src/application/interpret.js";
import { evaluationCases } from "../../src/evaluation/cases.js";
import {
  type ReminderProvider,
} from "../../src/providers/provider.js";
import { MockProvider } from "../../src/providers/mock-provider.js";
import { validateInvariants } from "../../src/validation/invariants.js";
import { validateResponse } from "../../src/validation/response-schema.js";

function isReminderRequest(value: unknown): value is ReminderRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.text === "string";
}

function requireResponseCase(caseId: string): EvaluationCase {
  const evaluationCase = evaluationCases.find((item) => item.caseId === caseId);
  if (
    !evaluationCase ||
    evaluationCase.expected.kind !== "response" ||
    !isReminderRequest(evaluationCase.input)
  ) {
    throw new Error(`${caseId} response fixture is missing or invalid.`);
  }
  return evaluationCase;
}

test("preserves clarification details for EVAL-007 through EVAL-014", async () => {
  const providerCalls: string[] = [];
  const mockProvider = new MockProvider();
  const provider: ReminderProvider = {
    async interpret(request, context) {
      if (context?.caseId) {
        providerCalls.push(context.caseId);
      }
      return mockProvider.interpret(request, context);
    },
  };

  for (let id = 7; id <= 14; id += 1) {
    const caseId = `EVAL-${String(id).padStart(3, "0")}`;
    const evaluationCase = requireResponseCase(caseId);
    const response = await interpretReminder(
      evaluationCase.input,
      provider,
      { caseId },
    );

    assert.deepEqual(response, evaluationCase.providerBehavior.kind === "response"
      ? evaluationCase.providerBehavior.response
      : undefined);
    assert.equal(response.status, "needs_clarification");
    assert.ok(response.clarificationQuestions.length > 0);
    assert.equal(validateResponse(response).valid, true);
    assert.equal(validateInvariants(response, evaluationCase.input).valid, true);
  }

  assert.deepEqual(
    providerCalls,
    Array.from({ length: 8 }, (_, index) =>
      `EVAL-${String(index + 7).padStart(3, "0")}`,
    ),
  );
});

test("requests missing explicit context without calling the provider", async () => {
  const provider = new MockProvider();
  for (const caseId of ["EVAL-026", "EVAL-027"]) {
    const evaluationCase = requireResponseCase(caseId);
    const response = await interpretReminder(
      evaluationCase.input,
      provider,
      { caseId },
    );

    assert.equal(response.status, "needs_clarification");
    assert.equal(response.reminder, null);
    assert.equal(response.clarificationQuestions.length, 1);
    assert.deepEqual(response, evaluationCase.expected.kind === "response"
      ? {
          schemaVersion: "1.0",
          status: evaluationCase.expected.status,
          reminder: null,
          clarificationQuestions:
            evaluationCase.expected.fields.clarificationQuestions,
          reason: null,
        }
      : undefined);
    assert.equal(validateResponse(response).valid, true);
    assert.equal(validateInvariants(response, evaluationCase.input).valid, true);
  }
});
