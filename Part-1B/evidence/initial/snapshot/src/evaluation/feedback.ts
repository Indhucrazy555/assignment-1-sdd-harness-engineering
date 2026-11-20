import type {
  CaseEvaluationResult,
  EvaluationRun,
  FailureFeedback,
  FeedbackFailureKind,
  FeedbackLayer,
  FeedbackValidationResult,
} from "../contracts/types.js";
import { evaluationCases } from "./cases.js";

export interface FeedbackEvidenceReferences {
  results: string;
  logs: string;
}

const feedbackLayers: readonly FeedbackLayer[] = [
  "provider",
  "input",
  "application",
  "schema",
  "deterministic",
  "semantic",
];
const failureKinds: readonly FeedbackFailureKind[] = [
  "provider",
  "input",
  "application",
  "structural",
  "invariant",
  "semantic",
];
const sensitiveTextPattern =
  /\b(?:sk|pk|ghp|gho|github_pat|AKIA)[-_][A-Za-z0-9_-]{12,}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:api[_-]?key|password|access[_-]?token)\s*[:=]\s*\S+/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasSafeText(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === "string") {
    return !sensitiveTextPattern.test(value);
  }
  if (typeof value !== "object" || value === null) {
    return true;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const safe = value.every((item) => hasSafeText(item, seen));
    seen.delete(value);
    return safe;
  }
  const safe = Object.values(value).every((item) => hasSafeText(item, seen));
  seen.delete(value);
  return safe;
}

function isEvidencePath(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }
  return (
    !/^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(value) &&
    !/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(value) &&
    !/[\r\n]/.test(value)
  );
}

function expectedBehavior(caseId: string): string {
  const evaluationCase = evaluationCases.find((item) => item.caseId === caseId);
  if (!evaluationCase) {
    throw new Error(`No approved evaluation fixture exists for ${caseId}.`);
  }
  if (evaluationCase.expected.kind === "provider_failure") {
    return `Expected provider failure code=${evaluationCase.expected.code}.`;
  }
  return `Expected status=${evaluationCase.expected.status}; fields=${JSON.stringify(
    evaluationCase.expected.fields,
  )}.`;
}

function observedBehavior(
  result: CaseEvaluationResult,
  layer: FeedbackLayer,
): string {
  if (layer === "provider" || layer === "input" || layer === "application") {
    return `Observed provider outcome=${result.providerOutcome}; failureKind=${result.failureKind ?? "unspecified"}; errorCode=${result.providerErrorCode ?? "none"}.`;
  }
  const layerResult = result.layers.find((item) => item.layer === layer);
  return `${layer} validation failed: ${layerResult?.issues.join("; ") ?? "no layer details were reported"}.`;
}

function feedbackForFailure(
  run: EvaluationRun,
  result: CaseEvaluationResult,
  layer: FeedbackLayer,
  failureKind: FeedbackFailureKind,
  evidenceReferences: FeedbackEvidenceReferences,
): FailureFeedback {
  const feedback: FailureFeedback = {
    runId: run.runId,
    caseIds: [result.caseId],
    layer,
    expectedBehavior: expectedBehavior(result.caseId),
    observedBehavior: observedBehavior(result, layer),
    failureKind,
    evidenceReferences: { ...evidenceReferences },
  };
  if (result.response !== null && result.response !== undefined) {
    feedback.originalResponse = structuredClone(result.response);
  }
  const validation = validateFailureFeedback(feedback);
  if (!validation.valid) {
    throw new Error(
      `Generated failure feedback is invalid: ${validation.issues.join("; ")}`,
    );
  }
  return feedback;
}

function failedFeedback(
  run: EvaluationRun,
  result: CaseEvaluationResult,
  evidenceReferences: FeedbackEvidenceReferences,
): FailureFeedback[] {
  const feedback: FailureFeedback[] = [];

  if (result.providerCheck === "FAIL") {
    const category = result.failureKind ?? "provider";
    if (category === "provider" || category === "input" || category === "application") {
      feedback.push(
        feedbackForFailure(
          run,
          result,
          category,
          category,
          evidenceReferences,
        ),
      );
    }
  }

  for (const layerResult of result.layers) {
    if (layerResult.outcome !== "FAIL") {
      continue;
    }
    const failureKind =
      layerResult.layer === "schema"
        ? "structural"
        : layerResult.layer === "deterministic"
          ? "invariant"
          : "semantic";
    feedback.push(
      feedbackForFailure(
        run,
        result,
        layerResult.layer,
        failureKind,
        evidenceReferences,
      ),
    );
  }

  return feedback;
}

export function createFailureFeedback(
  run: EvaluationRun,
  evidenceReferences: FeedbackEvidenceReferences,
): FailureFeedback[] {
  const feedback = run.cases.flatMap((result) =>
    failedFeedback(run, result, evidenceReferences),
  );
  if (feedback.length > 0) {
    return feedback;
  }
  if (run.outcome === "FAIL") {
    const aggregateFeedback: FailureFeedback = {
      runId: run.runId,
      caseIds: run.cases.map((result) => result.caseId),
      layer: "semantic",
      expectedBehavior: "Expected the full evaluation run to pass.",
      observedBehavior: `Observed aggregate semantic score=${run.semanticScore}; threshold=${run.semanticThreshold}.`,
      failureKind: "semantic",
      evidenceReferences: { ...evidenceReferences },
    };
    const validation = validateFailureFeedback(aggregateFeedback);
    if (!validation.valid) {
      throw new Error(
        `Generated failure feedback is invalid: ${validation.issues.join("; ")}`,
      );
    }
    return [aggregateFeedback];
  }
  return [];
}

export function validateFailureFeedback(
  value: unknown,
): FeedbackValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, issues: ["feedback must be an object"] };
  }

  const allowedKeys = new Set([
    "runId",
    "caseIds",
    "layer",
    "expectedBehavior",
    "observedBehavior",
    "failureKind",
    "originalResponse",
    "evidenceReferences",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    issues.push("feedback contains an unsupported property");
  }
  if (typeof value.runId !== "string" || value.runId.trim().length === 0) {
    issues.push("runId must be a non-empty string");
  }
  if (
    !Array.isArray(value.caseIds) ||
    value.caseIds.length === 0 ||
    value.caseIds.some(
      (caseId) => typeof caseId !== "string" || !/^EVAL-\d{3}$/.test(caseId),
    )
  ) {
    issues.push("caseIds must contain at least one evaluation case ID");
  } else if (new Set(value.caseIds).size !== value.caseIds.length) {
    issues.push("caseIds must not contain duplicates");
  }
  if (
    typeof value.layer !== "string" ||
    !feedbackLayers.includes(value.layer as FeedbackLayer)
  ) {
    issues.push("layer is not supported");
  }
  if (
    typeof value.failureKind !== "string" ||
    !failureKinds.includes(value.failureKind as FeedbackFailureKind)
  ) {
    issues.push("failureKind is not supported");
  }
  if (
    typeof value.expectedBehavior !== "string" ||
    value.expectedBehavior.trim().length === 0
  ) {
    issues.push("expectedBehavior must be a non-empty string");
  }
  if (
    typeof value.observedBehavior !== "string" ||
    value.observedBehavior.trim().length === 0
  ) {
    issues.push("observedBehavior must be a non-empty string");
  }
  if (!isRecord(value.evidenceReferences)) {
    issues.push("evidenceReferences must be an object");
  } else {
    if (
      Object.keys(value.evidenceReferences).some(
        (key) => key !== "results" && key !== "logs",
      )
    ) {
      issues.push("evidenceReferences contains an unsupported property");
    }
    if (!isEvidencePath(value.evidenceReferences.results)) {
      issues.push("evidenceReferences.results must be a safe relative path");
    }
    if (!isEvidencePath(value.evidenceReferences.logs)) {
      issues.push("evidenceReferences.logs must be a safe relative path");
    }
  }
  if (!hasSafeText(value)) {
    issues.push("feedback contains secret-like or cyclic data");
  }
  return { valid: issues.length === 0, issues };
}
