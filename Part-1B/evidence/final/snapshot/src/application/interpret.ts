import type {
  ReminderInterpretation,
  ReminderRequest,
} from "../contracts/types.js";
import {
  ProviderError,
  type ProviderCallContext,
  type ReminderProvider,
} from "../providers/provider.js";
import { validateInvariants } from "../validation/invariants.js";
import { validateResponse } from "../validation/response-schema.js";

export type InterpretationFailureKind =
  | "input"
  | "structural"
  | "invariant"
  | "application";

export class InterpretationError extends Error {
  constructor(
    readonly kind: InterpretationFailureKind,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "InterpretationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalUtcInstant(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

function rejected(reason: string): ReminderInterpretation {
  return {
    schemaVersion: "1.0",
    status: "rejected",
    reminder: null,
    clarificationQuestions: [],
    reason,
  };
}

type RequestParseResult =
  | { kind: "request"; request: ReminderRequest }
  | { kind: "rejected"; response: ReminderInterpretation };

function parseRequest(value: unknown): RequestParseResult {
  if (!isRecord(value)) {
    return {
      kind: "rejected",
      response: rejected("Request must be a JSON object."),
    };
  }
  if (
    Object.keys(value).some(
      (key) => !["text", "referenceDateTime", "timeZone"].includes(key),
    )
  ) {
    return {
      kind: "rejected",
      response: rejected("The request object contains an unsupported property."),
    };
  }

  const text = value.text;
  if (typeof text !== "string") {
    return {
      kind: "rejected",
      response: rejected("Request text must be a string."),
    };
  }
  const textLength = Array.from(text.trim()).length;
  if (textLength === 0) {
    return {
      kind: "rejected",
      response: rejected("Request text must contain 1 to 4,000 characters."),
    };
  }
  if (textLength > 4000) {
    return {
      kind: "rejected",
      response: rejected("Request text exceeds the 4,000-character limit."),
    };
  }

  const referenceDateTime = value.referenceDateTime;
  if (
    referenceDateTime !== undefined &&
    (typeof referenceDateTime !== "string" ||
      !isCanonicalUtcInstant(referenceDateTime))
  ) {
    const impossible =
      typeof referenceDateTime === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
        referenceDateTime,
      );
    return {
      kind: "rejected",
      response: rejected(
        impossible
          ? "The supplied reference instant is impossible."
          : "The supplied reference instant is invalid.",
      ),
    };
  }
  const timeZone = value.timeZone;
  if (
    timeZone !== undefined &&
    (typeof timeZone !== "string" || !isIanaTimeZone(timeZone))
  ) {
    return {
      kind: "rejected",
      response: rejected("The supplied time zone is invalid."),
    };
  }

  return {
    kind: "request",
    request: {
      text,
      ...(referenceDateTime === undefined ? {} : { referenceDateTime }),
      ...(timeZone === undefined ? {} : { timeZone }),
    },
  };
}

function validateInterpretation(
  output: unknown,
  request: unknown,
): ReminderInterpretation {
  const schemaResult = validateResponse(output);
  if (!schemaResult.valid) {
    throw new InterpretationError(
      "structural",
      "INVALID_PROVIDER_RESPONSE",
      `Interpretation failed schema validation: ${schemaResult.issues.join("; ")}`,
    );
  }

  const invariantResult = validateInvariants(output, request);
  if (!invariantResult.valid) {
    throw new InterpretationError(
      "invariant",
      "INVALID_PROVIDER_RESPONSE",
      `Interpretation failed deterministic validation: ${invariantResult.issues.join("; ")}`,
    );
  }

  return output as ReminderInterpretation;
}

export async function interpretReminder(
  input: unknown,
  provider: ReminderProvider,
  context?: ProviderCallContext,
): Promise<ReminderInterpretation> {
  const parsed = parseRequest(input);
  if (parsed.kind === "rejected") {
    return validateInterpretation(parsed.response, input);
  }
  const request = parsed.request;
  const clarificationQuestions: string[] = [];
  if (request.referenceDateTime === undefined) {
    clarificationQuestions.push(
      "What reference date and time should I use in UTC?",
    );
  }
  if (request.timeZone === undefined) {
    clarificationQuestions.push("Which IANA time zone should I use?");
  }
  if (clarificationQuestions.length > 0) {
    return validateInterpretation(
      {
        schemaVersion: "1.0",
        status: "needs_clarification",
        reminder: null,
        clarificationQuestions,
        reason: null,
      },
      request,
    );
  }

  let output: unknown;
  try {
    output = await provider.interpret(request, context);
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    throw new InterpretationError(
      "application",
      "PROVIDER_CALL_FAILED",
      "The provider call failed unexpectedly.",
    );
  }
  return validateInterpretation(output, request);
}
