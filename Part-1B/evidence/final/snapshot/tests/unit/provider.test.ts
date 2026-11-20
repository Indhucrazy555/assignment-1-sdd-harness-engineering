import { strict as assert } from "node:assert";
import { test } from "node:test";
import { MockProvider } from "../../src/providers/mock-provider.js";
import { ProviderError } from "../../src/providers/provider.js";
import type { ReminderRequest } from "../../src/contracts/types.js";
import { evaluationCases } from "../../src/evaluation/cases.js";

const request: ReminderRequest = {
  text: "Remind me to call Rahul tomorrow at 10 AM.",
  referenceDateTime: "2026-11-20T12:00:00.000Z",
  timeZone: "Asia/Kolkata",
};

test("returns a deterministic isolated response for an evaluation case", async () => {
  const provider = new MockProvider();
  const evaluationCase = evaluationCases.find(
    (item) => item.caseId === "EVAL-001",
  );
  if (!evaluationCase || evaluationCase.providerBehavior.kind !== "response") {
    throw new Error("EVAL-001 response fixture is missing.");
  }

  const first = await provider.interpret(request, { caseId: "EVAL-001" });
  assert.deepEqual(first, evaluationCase.providerBehavior.response);
  assert.notStrictEqual(first, evaluationCase.providerBehavior.response);
});

test("reports the controlled EVAL-024 provider failure distinctly", async () => {
  const provider = new MockProvider();
  await assert.rejects(
    provider.interpret(request, { caseId: "EVAL-024" }),
    (error: unknown) =>
      error instanceof ProviderError &&
      error.code === "PROVIDER_UNAVAILABLE",
  );
});

test("refuses a provider call for cases marked not called", async () => {
  const provider = new MockProvider();
  await assert.rejects(
    provider.interpret(request, { caseId: "EVAL-026" }),
    (error: unknown) =>
      error instanceof ProviderError && error.code === "PROVIDER_NOT_EXPECTED",
  );
});

test("fails explicitly for a case without a registered fixture", async () => {
  const provider = new MockProvider();
  await assert.rejects(
    provider.interpret(request, { caseId: "EVAL-999" }),
    (error: unknown) =>
      error instanceof ProviderError && error.code === "UNKNOWN_CASE",
  );
});
