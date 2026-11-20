export type ReminderStatus =
  | "ready"
  | "needs_clarification"
  | "rejected";

export interface ReminderRequest {
  text: string;
  referenceDateTime?: string;
  timeZone?: string;
}

export interface Reminder {
  title: string;
  recipient: string | null;
  scheduledAt: string | null;
  timeZone: string | null;
}

export interface ReminderInterpretation {
  schemaVersion: "1.0";
  status: ReminderStatus;
  reminder: Reminder | null;
  clarificationQuestions: string[];
  reason: string | null;
}

export type ProviderBehavior =
  | { kind: "response"; response: unknown }
  | { kind: "not_called" }
  | { kind: "failure"; code: string; message: string };

export interface SemanticFieldGroups {
  content: string[];
  resolution: string[];
  quality: string[];
}

export type ExpectedCaseOutcome =
  | {
      kind: "response";
      status: ReminderStatus;
      fields: Record<string, unknown>;
      semanticFields: SemanticFieldGroups;
    }
  | { kind: "provider_failure"; code: string };

export interface EvaluationCase {
  caseId: string;
  input: unknown;
  providerBehavior: ProviderBehavior;
  expected: ExpectedCaseOutcome;
}

export type ValidationLayer = "schema" | "deterministic" | "semantic";

export interface LayerResult {
  layer: ValidationLayer;
  outcome: "PASS" | "FAIL" | "NOT_APPLICABLE";
  issues: string[];
  points?: number;
}

export interface CaseEvaluationResult {
  caseId: string;
  requirementIds: string[];
  providerOutcome: "response" | "not_called" | "failure";
  providerCheck: "PASS" | "FAIL";
  providerErrorCode?: string;
  response: unknown | null;
  layers: LayerResult[];
  failureKind?: "provider" | "input" | "application";
}

export interface CaseExecution {
  providerOutcome: "response" | "not_called" | "failure";
  response: unknown | null;
  errorCode?: string;
  failureKind?: "provider" | "input" | "application";
}

export type EvaluationCaseExecutor = (
  evaluationCase: EvaluationCase,
) => Promise<CaseExecution>;

export interface EvaluationRun {
  runId: string;
  startedAt: string;
  completedAt: string;
  cases: CaseEvaluationResult[];
  semanticScore: number;
  semanticThreshold: 80;
  schemaPassRate: number;
  deterministicPassRate: number;
  outcome: "PASS" | "FAIL";
}

export type FeedbackLayer =
  | "provider"
  | "input"
  | "application"
  | "schema"
  | "deterministic"
  | "semantic";

export type FeedbackFailureKind =
  | "provider"
  | "input"
  | "application"
  | "structural"
  | "invariant"
  | "semantic";

export interface FailureFeedback {
  runId: string;
  caseIds: string[];
  layer: FeedbackLayer;
  expectedBehavior: string;
  observedBehavior: string;
  failureKind: FeedbackFailureKind;
  originalResponse?: unknown;
  evidenceReferences: {
    results: string;
    logs: string;
  };
}

export interface FeedbackValidationResult {
  valid: boolean;
  issues: string[];
}
