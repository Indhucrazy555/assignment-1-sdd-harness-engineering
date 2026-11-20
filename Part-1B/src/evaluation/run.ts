import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { InterpretationError, interpretReminder } from "../application/interpret.js";
import type {
  CaseExecution,
  CaseEvaluationResult,
  EvaluationCase,
  EvaluationCaseExecutor,
  EvaluationRun,
  ExpectedCaseOutcome,
  LayerResult,
} from "../contracts/types.js";
import { evaluationCases } from "./cases.js";
import { MockProvider } from "../providers/mock-provider.js";
import { ProviderError } from "../providers/provider.js";
import { validateInvariants } from "../validation/invariants.js";
import { validateResponse } from "../validation/response-schema.js";
import { requirementsForCase } from "./traceability.js";

const semanticThreshold = 80 as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueAtPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split(".")) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function matchesFields(
  response: unknown,
  expected: Extract<ExpectedCaseOutcome, { kind: "response" }>,
  paths: readonly string[],
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  for (const path of paths) {
    if (
      !Object.hasOwn(expected.fields, path) ||
      !isDeepStrictEqual(valueAtPath(response, path), expected.fields[path])
    ) {
      issues.push(`expected field ${path} did not match`);
    }
  }
  return { valid: issues.length === 0, issues };
}

function semanticResult(
  response: unknown,
  expected: Extract<ExpectedCaseOutcome, { kind: "response" }>,
): LayerResult {
  const issues: string[] = [];
  let points = 0;

  if (isRecord(response) && response.status === expected.status) {
    points += 2;
  } else {
    issues.push("response status did not match the expected status");
  }

  const content = matchesFields(response, expected, expected.semanticFields.content);
  if (content.valid) {
    points += 1;
  } else {
    issues.push(...content.issues);
  }

  const resolution = matchesFields(
    response,
    expected,
    expected.semanticFields.resolution,
  );
  if (resolution.valid) {
    points += 1;
  } else {
    issues.push(...resolution.issues);
  }

  const quality = matchesFields(
    response,
    expected,
    expected.semanticFields.quality,
  );
  if (quality.valid) {
    points += 1;
  } else {
    issues.push(...quality.issues);
  }

  return {
    layer: "semantic",
    outcome: points === 5 ? "PASS" : "FAIL",
    issues,
    points,
  };
}

function responseLayers(
  evaluationCase: EvaluationCase,
  response: unknown | null,
): LayerResult[] {
  if (evaluationCase.expected.kind !== "response") {
    return [
      { layer: "schema", outcome: "NOT_APPLICABLE", issues: [] },
      { layer: "deterministic", outcome: "NOT_APPLICABLE", issues: [] },
      { layer: "semantic", outcome: "NOT_APPLICABLE", issues: [] },
    ];
  }

  if (response === null) {
    const issue = "expected a JSON response but none was produced";
    return [
      { layer: "schema", outcome: "FAIL", issues: [issue] },
      { layer: "deterministic", outcome: "FAIL", issues: [issue] },
      {
        layer: "semantic",
        outcome: "FAIL",
        issues: [issue],
        points: 0,
      },
    ];
  }

  const schema = validateResponse(response);
  const deterministic = validateInvariants(response, evaluationCase.input);
  return [
    {
      layer: "schema",
      outcome: schema.valid ? "PASS" : "FAIL",
      issues: schema.issues,
    },
    {
      layer: "deterministic",
      outcome: deterministic.valid ? "PASS" : "FAIL",
      issues: deterministic.issues,
    },
    semanticResult(response, evaluationCase.expected),
  ];
}

function providerCheck(
  evaluationCase: EvaluationCase,
  providerOutcome: "response" | "not_called" | "failure",
  response: unknown | null,
  errorCode?: string,
): "PASS" | "FAIL" {
  if (evaluationCase.expected.kind === "provider_failure") {
    return providerOutcome === "failure" &&
      response === null &&
      errorCode === evaluationCase.expected.code
      ? "PASS"
      : "FAIL";
  }

  if (evaluationCase.providerBehavior.kind === "not_called") {
    return providerOutcome === "not_called" && response !== null ? "PASS" : "FAIL";
  }

  return providerOutcome === "response" && response !== null ? "PASS" : "FAIL";
}

function evaluateCase(
  evaluationCase: EvaluationCase,
  execution: Awaited<ReturnType<EvaluationCaseExecutor>>,
): CaseEvaluationResult {
  const check = providerCheck(
    evaluationCase,
    execution.providerOutcome,
    execution.response,
    execution.errorCode,
  );
  const layers = responseLayers(evaluationCase, execution.response);
  const result: CaseEvaluationResult = {
    caseId: evaluationCase.caseId,
    requirementIds: [],
    providerOutcome: execution.providerOutcome,
    providerCheck: check,
    response: execution.response,
    layers,
  };

  if (execution.errorCode !== undefined) {
    result.providerErrorCode = execution.errorCode;
  }
  if (execution.failureKind !== undefined) {
    result.failureKind = execution.failureKind;
  } else if (check === "FAIL") {
    result.failureKind = "provider";
  }
  return result;
}

function percent(numerator: number, denominator: number): number {
  return denominator === 0
    ? 0
    : Number(((numerator / denominator) * 100).toFixed(2));
}

export async function runEvaluation(
  cases: readonly EvaluationCase[],
  executeCase: EvaluationCaseExecutor,
): Promise<EvaluationRun> {
  const startedAt = new Date().toISOString();
  const results: CaseEvaluationResult[] = [];
  for (const evaluationCase of cases) {
    const execution = await executeCase(evaluationCase);
    results.push(evaluateCase(evaluationCase, execution));
  }

  const failedCaseIds = results
    .filter(
      (result) =>
        result.providerCheck === "FAIL" ||
        result.layers.some((layer) => layer.outcome === "FAIL"),
    )
    .map((result) => result.caseId);
  for (const result of results) {
    result.requirementIds = requirementsForCase(result.caseId, failedCaseIds);
  }

  const responseCaseCount = cases.filter(
    (evaluationCase) => evaluationCase.expected.kind === "response",
  ).length;
  const schemaPassCount = results.filter((result) =>
    result.layers.some(
      (layer) => layer.layer === "schema" && layer.outcome === "PASS",
    ),
  ).length;
  const deterministicPassCount = results.filter((result) =>
    result.layers.some(
      (layer) =>
        layer.layer === "deterministic" && layer.outcome === "PASS",
    ),
  ).length;
  const semanticPoints = results.reduce(
    (total, result) =>
      total +
      (result.layers.find((layer) => layer.layer === "semantic")?.points ?? 0),
    0,
  );
  const semanticScore = percent(semanticPoints, responseCaseCount * 5);
  const schemaPassRate = percent(schemaPassCount, responseCaseCount);
  const deterministicPassRate = percent(
    deterministicPassCount,
    responseCaseCount,
  );
  const allProviderChecksPass = results.every(
    (result) => result.providerCheck === "PASS",
  );
  const allResponseLayersPass = results.every((result) =>
    result.layers
      .filter(
        (layer) =>
          layer.layer === "schema" || layer.layer === "deterministic",
      )
      .every((layer) => layer.outcome === "PASS" || layer.outcome === "NOT_APPLICABLE"),
  );
  const outcome =
    responseCaseCount > 0 &&
    allProviderChecksPass &&
    allResponseLayersPass &&
    semanticScore >= semanticThreshold
      ? "PASS"
      : "FAIL";

  return {
    runId: randomUUID(),
    startedAt,
    completedAt: new Date().toISOString(),
    cases: results,
    semanticScore,
    semanticThreshold,
    schemaPassRate,
    deterministicPassRate,
    outcome,
  };
}

export async function executeEvaluationCase(
  evaluationCase: EvaluationCase,
): Promise<CaseExecution> {
  try {
    const response = await interpretReminder(
      evaluationCase.input,
      new MockProvider(),
      { caseId: evaluationCase.caseId },
    );
    return {
      providerOutcome:
        evaluationCase.providerBehavior.kind === "not_called"
          ? "not_called"
          : "response",
      response,
    };
  } catch (error) {
    if (error instanceof ProviderError) {
      return {
        providerOutcome: "failure",
        response: null,
        errorCode: error.code,
        failureKind: "provider",
      };
    }
    if (error instanceof InterpretationError) {
      return {
        providerOutcome: "failure",
        response: null,
        errorCode: error.code,
        failureKind: "application",
      };
    }
    throw error;
  }
}

export async function runApprovedEvaluation(): Promise<EvaluationRun> {
  return runEvaluation(evaluationCases, executeEvaluationCase);
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const run = await runApprovedEvaluation();
    process.stdout.write(`${JSON.stringify(run)}\n`);
    if (run.outcome !== "PASS") {
      process.exitCode = 1;
    }
  } catch {
    process.stderr.write("Evaluation failure: the evaluation could not complete.\n");
    process.exitCode = 1;
  }
}
