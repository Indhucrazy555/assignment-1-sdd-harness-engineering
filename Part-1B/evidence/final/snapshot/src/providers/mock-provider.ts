import { evaluationCases } from "../evaluation/cases.js";
import type {
  EvaluationCase,
  ProviderBehavior,
  ReminderRequest,
} from "../contracts/types.js";
import {
  ProviderError,
  type ProviderCallContext,
  type ReminderProvider,
} from "./provider.js";

function providerResult(behavior: ProviderBehavior): unknown {
  if (behavior.kind === "response") {
    return structuredClone(behavior.response);
  }
  if (behavior.kind === "failure") {
    throw new ProviderError(behavior.code, behavior.message);
  }
  throw new ProviderError(
    "PROVIDER_NOT_EXPECTED",
    "Provider invocation was not expected for this evaluation case.",
  );
}

export class MockProvider implements ReminderProvider {
  constructor(
    private readonly cases: readonly EvaluationCase[] = evaluationCases,
  ) {}

  async interpret(
    _request: ReminderRequest,
    context?: ProviderCallContext,
  ): Promise<unknown> {
    const caseId = context?.caseId;
    const evaluationCase = this.cases.find((item) => item.caseId === caseId);
    if (!evaluationCase) {
      throw new ProviderError(
        "UNKNOWN_CASE",
        "No controlled provider fixture exists for this evaluation case.",
      );
    }

    return providerResult(evaluationCase.providerBehavior);
  }
}
