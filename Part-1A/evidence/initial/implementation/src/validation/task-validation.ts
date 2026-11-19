import type {
  CreateTaskInput,
  TaskListQuery,
  TaskPriority,
  TaskStatus,
  UpdateTaskInput,
} from "../domain/task.ts";
import { ApiError, type ApiErrorDetail } from "../errors/api-error.ts";

const priorities = new Set<string>(["low", "medium", "high"]);
const statuses = new Set<string>(["pending", "in_progress", "completed"]);
const createFields = new Set([
  "title",
  "description",
  "priority",
  "status",
  "tags",
  "dueDate",
]);
const updateFields = new Set([
  "title",
  "description",
  "priority",
  "status",
  "tags",
  "dueDate",
]);
const queryFields = new Set(["status", "priority", "tags", "sort"]);
const taskIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const createdAtPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function validateCreateTask(value: unknown): CreateTaskInput {
  const body = asRecord(value);
  if (!body) {
    throwValidation([{ field: "body", issue: "must be a JSON object" }]);
  }

  const issues: ApiErrorDetail[] = [];
  addUnknownFieldIssues(body, createFields, issues);
  const title = validateTitle(body, true, issues);
  const description = validateDescription(body, true, issues);
  const priority = validatePriority(body, true, issues);
  const status = validateStatus(body, issues);
  const tags = validateTags(body, issues);
  const dueDate = validateDueDate(body, issues);
  throwIfInvalid(issues);

  if (title === undefined || description === undefined || priority === undefined) {
    throwValidation([{ field: "body", issue: "is missing required fields" }]);
  }

  return {
    title,
    description,
    priority,
    ...(status === undefined ? {} : { status }),
    ...(tags === undefined ? {} : { tags }),
    ...(dueDate === undefined ? {} : { dueDate }),
  };
}

export function validateUpdateTask(value: unknown): UpdateTaskInput {
  const body = asRecord(value);
  if (!body) {
    throwValidation([{ field: "body", issue: "must be a JSON object" }]);
  }

  const issues: ApiErrorDetail[] = [];
  if (Object.keys(body).length === 0) {
    issues.push({ field: "body", issue: "must contain at least one field" });
  }
  addUnknownFieldIssues(body, updateFields, issues);
  const title = validateTitle(body, false, issues);
  const description = validateDescription(body, false, issues);
  const priority = validatePriority(body, false, issues);
  const status = validateStatus(body, issues);
  const tags = validateTags(body, issues);
  const dueDate = validateDueDate(body, issues);
  throwIfInvalid(issues);

  return {
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(priority === undefined ? {} : { priority }),
    ...(status === undefined ? {} : { status }),
    ...(tags === undefined ? {} : { tags }),
    ...(dueDate === undefined ? {} : { dueDate }),
  };
}

export function validateListQuery(params: URLSearchParams): TaskListQuery {
  const issues: ApiErrorDetail[] = [];
  for (const [field] of params) {
    if (!queryFields.has(field)) {
      issues.push({ field, issue: "is not supported" });
    }
  }

  const values = new Map<string, string>();
  for (const field of queryFields) {
    const fieldValues = params.getAll(field);
    if (fieldValues.length > 1) {
      issues.push({ field, issue: "must not be repeated" });
    } else if (fieldValues.length === 1) {
      values.set(field, fieldValues[0]);
      if (fieldValues[0].trim().length === 0) {
        issues.push({ field, issue: "must not be blank" });
      }
    }
  }

  const result: TaskListQuery = {};
  const statusValue = values.get("status");
  if (statusValue !== undefined) {
    if (isTaskStatus(statusValue)) {
      result.status = statusValue;
    } else if (statusValue.trim().length > 0) {
      issues.push({ field: "status", issue: "must be a supported status" });
    }
  }

  const priorityValue = values.get("priority");
  if (priorityValue !== undefined) {
    if (isTaskPriority(priorityValue)) {
      result.priority = priorityValue;
    } else if (priorityValue.trim().length > 0) {
      issues.push({ field: "priority", issue: "must be a supported priority" });
    }
  }

  const tagsValue = values.get("tags");
  if (tagsValue !== undefined && tagsValue.trim().length > 0) {
    const tags = parseTagList(tagsValue, "tags", issues);
    if (tags) {
      result.tags = tags;
    }
  }

  const sortValue = values.get("sort");
  if (sortValue !== undefined && sortValue.trim().length > 0) {
    if (sortValue !== "priority") {
      issues.push({ field: "sort", issue: "must be priority" });
    } else {
      result.sort = "priority";
    }
  }

  throwIfInvalid(issues);
  return result;
}

export function isCanonicalTaskId(value: unknown): value is string {
  return typeof value === "string" && taskIdPattern.test(value);
}

export function isValidDueDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= monthLengths[month - 1];
}

export function isValidCreatedAt(value: string): boolean {
  if (!createdAtPattern.test(value)) {
    return false;
  }

  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString() === value
  );
}

function validateTitle(
  body: Record<string, unknown>,
  required: boolean,
  issues: ApiErrorDetail[],
): string | undefined {
  if (!("title" in body)) {
    if (required) {
      issues.push({ field: "title", issue: "is required" });
    }
    return undefined;
  }
  if (typeof body.title !== "string") {
    issues.push({ field: "title", issue: "must be a string" });
    return undefined;
  }

  const title = body.title.trim();
  const length = codePointLength(title);
  if (length < 1 || length > 100) {
    issues.push({ field: "title", issue: "must contain 1 to 100 characters" });
  }
  return title;
}

function validateDescription(
  body: Record<string, unknown>,
  required: boolean,
  issues: ApiErrorDetail[],
): string | undefined {
  if (!("description" in body)) {
    if (required) {
      issues.push({ field: "description", issue: "is required" });
    }
    return undefined;
  }
  if (typeof body.description !== "string") {
    issues.push({ field: "description", issue: "must be a string" });
    return undefined;
  }
  if (codePointLength(body.description) > 2000) {
    issues.push({
      field: "description",
      issue: "must contain at most 2000 characters",
    });
  }
  return body.description;
}

function validatePriority(
  body: Record<string, unknown>,
  required: boolean,
  issues: ApiErrorDetail[],
): TaskPriority | undefined {
  if (!("priority" in body)) {
    if (required) {
      issues.push({ field: "priority", issue: "is required" });
    }
    return undefined;
  }
  if (!isTaskPriority(body.priority)) {
    issues.push({ field: "priority", issue: "must be a supported priority" });
    return undefined;
  }
  return body.priority;
}

function validateStatus(
  body: Record<string, unknown>,
  issues: ApiErrorDetail[],
): TaskStatus | undefined {
  if (!("status" in body)) {
    return undefined;
  }
  if (!isTaskStatus(body.status)) {
    issues.push({ field: "status", issue: "must be a supported status" });
    return undefined;
  }
  return body.status;
}

function validateTags(
  body: Record<string, unknown>,
  issues: ApiErrorDetail[],
): string[] | undefined {
  if (!("tags" in body)) {
    return undefined;
  }
  if (!Array.isArray(body.tags)) {
    issues.push({ field: "tags", issue: "must be an array" });
    return undefined;
  }
  if (body.tags.length > 10) {
    issues.push({ field: "tags", issue: "must contain at most 10 tags" });
  }

  const tags: string[] = [];
  const seen = new Set<string>();
  body.tags.forEach((value: unknown, index: number) => {
    if (typeof value !== "string") {
      issues.push({
        field: "tags",
        issue: `tag ${index + 1} must be a string`,
      });
      return;
    }
    const tag = value.trim();
    const length = codePointLength(tag);
    if (length < 1 || length > 30) {
      issues.push({
        field: "tags",
        issue: `tag ${index + 1} must contain 1 to 30 characters`,
      });
    }
    const folded = tag.toLowerCase();
    if (seen.has(folded)) {
      issues.push({
        field: "tags",
        issue: `tag ${index + 1} duplicates another tag`,
      });
    }
    seen.add(folded);
    tags.push(tag);
  });
  return tags;
}

function validateDueDate(
  body: Record<string, unknown>,
  issues: ApiErrorDetail[],
): string | null | undefined {
  if (!("dueDate" in body)) {
    return undefined;
  }
  if (body.dueDate === null) {
    return null;
  }
  if (
    typeof body.dueDate !== "string" ||
    !isValidDueDate(body.dueDate)
  ) {
    issues.push({
      field: "dueDate",
      issue: "must be a valid YYYY-MM-DD date or null",
    });
    return undefined;
  }
  return body.dueDate;
}

function parseTagList(
  value: string,
  field: string,
  issues: ApiErrorDetail[],
): string[] | undefined {
  const tags = value.split(",").map((tag) => tag.trim());
  if (tags.length > 10) {
    issues.push({ field, issue: "must contain at most 10 tags" });
  }

  const seen = new Set<string>();
  for (const [index, tag] of tags.entries()) {
    if (tag.length === 0) {
      issues.push({ field, issue: `tag ${index + 1} must not be blank` });
      continue;
    }
    if (codePointLength(tag) > 30) {
      issues.push({
        field,
        issue: `tag ${index + 1} must contain at most 30 characters`,
      });
    }
    const folded = tag.toLowerCase();
    if (seen.has(folded)) {
      issues.push({ field, issue: `tag ${index + 1} is duplicated` });
    }
    seen.add(folded);
  }
  return tags;
}

function addUnknownFieldIssues(
  body: Record<string, unknown>,
  allowed: Set<string>,
  issues: ApiErrorDetail[],
): void {
  for (const field of Object.keys(body)) {
    if (!allowed.has(field)) {
      issues.push({
        field,
        issue:
          field === "id" || field === "createdAt"
            ? "is immutable"
            : "is not supported",
      });
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && priorities.has(value);
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && statuses.has(value);
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function throwIfInvalid(issues: ApiErrorDetail[]): void {
  if (issues.length > 0) {
    throwValidation(issues);
  }
}

function throwValidation(issues: ApiErrorDetail[]): never {
  issues.sort(
    (left, right) =>
      compareText(left.field, right.field) ||
      compareText(left.issue, right.issue),
  );
  throw new ApiError(
    400,
    "VALIDATION_ERROR",
    "Request validation failed.",
    issues,
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
