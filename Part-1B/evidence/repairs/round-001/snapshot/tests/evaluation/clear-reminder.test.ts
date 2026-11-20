import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { ReminderRequest } from "../../src/contracts/types.js";
import { interpretReminder } from "../../src/application/interpret.js";
import { evaluationCases } from "../../src/evaluation/cases.js";
import { MockProvider } from "../../src/providers/mock-provider.js";
import { validateInvariants } from "../../src/validation/invariants.js";
import { validateResponse } from "../../src/validation/response-schema.js";

function isReminderRequest(value: unknown): value is ReminderRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.text === "string" &&
    typeof record.referenceDateTime === "string" &&
    typeof record.timeZone === "string"
  );
}

test("interprets EVAL-001 through EVAL-006 as exact validated ready responses", async () => {
  const provider = new MockProvider();
  const clearCases = evaluationCases.slice(0, 6);

  assert.equal(clearCases.length, 6);
  for (const [index, evaluationCase] of clearCases.entries()) {
    assert.equal(
      evaluationCase.caseId,
      `EVAL-${String(index + 1).padStart(3, "0")}`,
    );
    assert.equal(evaluationCase.providerBehavior.kind, "response");
    if (
      evaluationCase.providerBehavior.kind !== "response" ||
      !isReminderRequest(evaluationCase.input)
    ) {
      throw new Error(`${evaluationCase.caseId} fixture is incomplete.`);
    }

    const response = await interpretReminder(
      evaluationCase.input,
      provider,
      { caseId: evaluationCase.caseId },
    );
    assert.deepEqual(response, evaluationCase.providerBehavior.response);
    assert.equal(response.status, "ready");
    assert.equal(validateResponse(response).valid, true);
    assert.equal(validateInvariants(response, evaluationCase.input).valid, true);
  }
});

test("repeats an identical clear evaluation without side effects", async () => {
  const evaluationCase = evaluationCases[0];
  if (
    !evaluationCase ||
    evaluationCase.providerBehavior.kind !== "response" ||
    !isReminderRequest(evaluationCase.input)
  ) {
    throw new Error("EVAL-001 response fixture is missing.");
  }

  const provider = new MockProvider();
  const first = await interpretReminder(evaluationCase.input, provider, {
    caseId: evaluationCase.caseId,
  });
  const second = await interpretReminder(evaluationCase.input, provider, {
    caseId: evaluationCase.caseId,
  });

  assert.deepEqual(second, first);
  assert.deepEqual(first, evaluationCase.providerBehavior.response);
});
