import { strict as assert } from "node:assert";
import { test } from "node:test";
import type {
  CaseExecution,
  EvaluationCase,
  EvaluationCaseExecutor,
  ExpectedCaseOutcome,
  ReminderInterpretation,
} from "../../src/contracts/types.js";
import { evaluationCases } from "../../src/evaluation/cases.js";
import { runEvaluation } from "../../src/evaluation/run.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseFromExpected(
  expected: Extract<ExpectedCaseOutcome, { kind: "response" }>,
): ReminderInterpretation {
  const fields = expected.fields;
  const title = fields["reminder.title"];
  const recipient = fields["reminder.recipient"];
  const scheduledAt = fields["reminder.scheduledAt"];
  const timeZone = fields["reminder.timeZone"];
  const clarificationQuestions = fields.clarificationQuestions;
  const reason = fields.reason;

  let reminder: ReminderInterpretation["reminder"];
  if (fields.reminder === null) {
    reminder = null;
  } else {
    if (typeof title !== "string") {
      throw new Error("Expected reminder fixture is missing a title.");
    }
    if (typeof recipient !== "string" && recipient !== null) {
      throw new Error("Expected reminder fixture has an invalid recipient.");
    }
    if (typeof scheduledAt !== "string" && scheduledAt !== null) {
      throw new Error("Expected reminder fixture has an invalid schedule.");
    }
    if (typeof timeZone !== "string" && timeZone !== null) {
      throw new Error("Expected reminder fixture has an invalid time zone.");
    }
    reminder = { title, recipient, scheduledAt, timeZone };
  }

  if (!Array.isArray(clarificationQuestions)) {
    throw new Error("Expected response fixture has invalid questions.");
  }
  const questions: string[] = [];
  for (const question of clarificationQuestions) {
    if (typeof question !== "string") {
      throw new Error("Expected response fixture has an invalid question.");
    }
    questions.push(question);
  }
  if (typeof reason !== "string" && reason !== null) {
    throw new Error("Expected response fixture contains invalid fields.");
  }

  return {
    schemaVersion: "1.0",
    status: expected.status,
    reminder,
    clarificationQuestions: questions,
    reason,
  };
}

const successfulExecutor: EvaluationCaseExecutor = async (
  evaluationCase: EvaluationCase,
): Promise<CaseExecution> => {
  if (evaluationCase.expected.kind === "provider_failure") {
    return {
      providerOutcome: "failure",
      response: null,
      failureKind: "provider",
      errorCode: evaluationCase.expected.code,
    };
  }
  if (evaluationCase.providerBehavior.kind === "not_called") {
    return {
      providerOutcome: "not_called",
      response: responseFromExpected(evaluationCase.expected),
    };
  }
  if (evaluationCase.providerBehavior.kind === "failure") {
    return {
      providerOutcome: "failure",
      response: null,
      failureKind: "provider",
      errorCode: evaluationCase.providerBehavior.code,
    };
  }
  return {
    providerOutcome: "response",
    response: evaluationCase.providerBehavior.response,
  };
};

test("reports all 27 cases and the three validation layers independently", async () => {
  const run = await runEvaluation(evaluationCases, successfulExecutor);

  assert.equal(run.cases.length, 27);
  assert.equal(run.semanticScore, 100);
  assert.equal(run.semanticThreshold, 80);
  assert.equal(run.schemaPassRate, 100);
  assert.equal(run.deterministicPassRate, 100);
  assert.equal(run.outcome, "PASS");
  assert.equal(
    run.cases.filter((result) =>
      result.layers.some(
        (layer) => layer.layer === "semantic" && layer.points !== undefined,
      ),
    ).length,
    26,
  );
});

test("keeps EVAL-024 as a provider check without response-layer scoring", async () => {
  const run = await runEvaluation(evaluationCases, successfulExecutor);
  const providerResult = run.cases.find(
    (result) => result.caseId === "EVAL-024",
  );

  assert.equal(providerResult?.providerOutcome, "failure");
  assert.equal(providerResult?.providerCheck, "PASS");
  assert.equal(providerResult?.response, null);
  assert.equal(
    providerResult?.layers.every(
      (layer) => layer.outcome === "NOT_APPLICABLE",
    ),
    true,
  );
});

test("fails when the semantic aggregate is below 80 percent", async () => {
  const lowScoringExecutor: EvaluationCaseExecutor = async (evaluationCase) => {
    const execution = await successfulExecutor(evaluationCase);
    if (
      Number(evaluationCase.caseId.slice(-3)) <= 6 &&
      execution.response !== null
    ) {
      return {
        ...execution,
        response: {
          schemaVersion: "1.0",
          status: "rejected",
          reminder: null,
          clarificationQuestions: [],
          reason: "Controlled semantic mismatch.",
        },
      };
    }
    return execution;
  };

  const run = await runEvaluation(evaluationCases, lowScoringExecutor);
  assert.ok(run.semanticScore < 80);
  assert.equal(run.outcome, "FAIL");
});

test("schema failures fail the run even when semantic score passes", async () => {
  const invalidSchemaExecutor: EvaluationCaseExecutor = async (
    evaluationCase,
  ) => {
    const execution = await successfulExecutor(evaluationCase);
    if (evaluationCase.caseId !== "EVAL-001" || !isRecord(execution.response)) {
      return execution;
    }
    return {
      ...execution,
      response: {
        ...execution.response,
        extra: "not allowed",
      },
    };
  };

  const run = await runEvaluation(evaluationCases, invalidSchemaExecutor);
  assert.equal(run.semanticScore, 100);
  assert.equal(run.schemaPassRate < 100, true);
  assert.equal(run.outcome, "FAIL");
});
