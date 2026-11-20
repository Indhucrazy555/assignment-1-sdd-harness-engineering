export interface InvariantValidationResult {
  valid: boolean;
  issues: string[];
}

const canonicalUtcPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== "string" || !canonicalUtcPattern.test(value)) {
    return false;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function isIanaTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

export function validateInvariants(
  value: unknown,
  request: unknown,
): InvariantValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, issues: ["response must be an object"] };
  }

  const status = value.status;
  const questions = value.clarificationQuestions;
  const reason = value.reason;
  const reminder = value.reminder;
  const referenceDateTime = isRecord(request)
    ? request.referenceDateTime
    : undefined;

  if (status === "ready") {
    if (!isRecord(reminder)) {
      issues.push("ready response must contain a reminder object");
    } else {
      if (typeof reminder.title !== "string" || reminder.title.trim().length === 0) {
        issues.push("ready reminder title must contain non-whitespace text");
      }
      if (
        typeof reminder.recipient !== "string" ||
        reminder.recipient.trim().length === 0
      ) {
        issues.push("ready reminder recipient must contain non-whitespace text");
      }
      if (!isCanonicalInstant(reminder.scheduledAt)) {
        issues.push("ready scheduledAt must be a real canonical UTC instant");
      } else if (isCanonicalInstant(referenceDateTime)) {
        if (Date.parse(reminder.scheduledAt) <= Date.parse(referenceDateTime)) {
          issues.push("ready scheduledAt must be later than referenceDateTime");
        }
      } else {
        issues.push("ready response requires a real canonical referenceDateTime");
      }
      if (!isIanaTimeZone(reminder.timeZone)) {
        issues.push("ready reminder timeZone must be a valid IANA identifier");
      }
    }

    if (!Array.isArray(questions) || questions.length !== 0) {
      issues.push("ready response must not contain clarification questions");
    }
    if (reason !== null) {
      issues.push("ready response reason must be null");
    }
  } else if (status === "needs_clarification") {
    if (!Array.isArray(questions) || questions.length === 0) {
      issues.push("clarification response must contain at least one question");
    }
    if (reason !== null) {
      issues.push("clarification response reason must be null");
    }
  } else if (status === "rejected") {
    if (reminder !== null) {
      issues.push("rejected response must not contain a reminder");
    }
    if (!Array.isArray(questions) || questions.length !== 0) {
      issues.push("rejected response must not contain clarification questions");
    }
    if (typeof reason !== "string" || reason.trim().length === 0) {
      issues.push("rejected response must contain a non-empty reason");
    }
  } else {
    issues.push("response status is invalid");
  }

  return { valid: issues.length === 0, issues };
}
