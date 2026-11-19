import assert from "node:assert/strict";
import test from "node:test";

const validCreate = {
  title: "Prepare report",
  description: "Review the draft",
  priority: "medium",
};

async function getValidation() {
  return import("../../src/validation/task-validation.ts");
}

function assertInvalid(action) {
  assert.throws(action);
}

function getValidationDetails(action) {
  let caughtError;
  try {
    action();
  } catch (error) {
    caughtError = error;
  }
  assert.ok(caughtError);
  assert.ok(Array.isArray(caughtError.details));
  assert.ok(
    caughtError.details.every(
      (detail) =>
        typeof detail.field === "string" &&
        typeof detail.issue === "string",
    ),
  );
  return caughtError.details;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertDetailsSorted(details) {
  const sorted = [...details].sort(
    (left, right) =>
      compareText(left.field, right.field) ||
      compareText(left.issue, right.issue),
  );
  assert.deepEqual(details, sorted);
}

test("create validation requires a JSON object and required fields", async () => {
  const { validateCreateTask } = await getValidation();

  for (const body of [null, [], "task", 7, {}, { title: "title", priority: "low" }]) {
    assertInvalid(() => validateCreateTask(body));
  }
  assert.doesNotThrow(() =>
    validateCreateTask({ ...validCreate, description: "" }),
  );
});

test("field limits count Unicode code points and enforce enums and tag rules", async () => {
  const { validateCreateTask } = await getValidation();

  assert.doesNotThrow(() =>
    validateCreateTask({
      ...validCreate,
      title: "😀".repeat(100),
      description: "x".repeat(2000),
      tags: ["🟩".repeat(30)],
    }),
  );
  assertInvalid(() =>
    validateCreateTask({ ...validCreate, title: "😀".repeat(101) }),
  );
  assertInvalid(() =>
    validateCreateTask({ ...validCreate, description: "x".repeat(2001) }),
  );
  assertInvalid(() =>
    validateCreateTask({ ...validCreate, description: 1 }),
  );
  assertInvalid(() =>
    validateCreateTask({ ...validCreate, title: "   " }),
  );
  assertInvalid(() =>
    validateCreateTask({ ...validCreate, priority: "urgent" }),
  );
  assertInvalid(() =>
    validateCreateTask({ ...validCreate, status: "blocked" }),
  );
  assertInvalid(() =>
    validateCreateTask({ ...validCreate, tags: ["Work", "work"] }),
  );
  assertInvalid(() =>
    validateCreateTask({ ...validCreate, tags: [""] }),
  );
  assertInvalid(() =>
    validateCreateTask({ ...validCreate, tags: "work" }),
  );
  assertInvalid(() =>
    validateCreateTask({ ...validCreate, tags: ["x".repeat(31)] }),
  );
  assertInvalid(() =>
    validateCreateTask({ ...validCreate, tags: Array(11).fill("tag") }),
  );
});

test("due dates accept calendar dates and null, but reject impossible or datetime values", async () => {
  const { validateCreateTask } = await getValidation();

  assert.doesNotThrow(() =>
    validateCreateTask({ ...validCreate, dueDate: "2000-02-29" }),
  );
  assert.doesNotThrow(() =>
    validateCreateTask({ ...validCreate, dueDate: null }),
  );
  for (const dueDate of [
    "2025-02-29",
    "2026-11-25T00:00:00.000Z",
    "2026-2-05",
  ]) {
    assertInvalid(() =>
      validateCreateTask({ ...validCreate, dueDate }),
    );
  }
});

test("patch rejects empty objects, immutable fields, and unknown fields", async () => {
  const { validateUpdateTask } = await getValidation();

  for (const body of [
    {},
    { id: "00000000-0000-4000-8000-000000000001" },
    { createdAt: "2026-11-19T13:00:00.000Z" },
    { extra: true },
  ]) {
    assertInvalid(() => validateUpdateTask(body));
  }
  assert.doesNotThrow(() => validateUpdateTask({ dueDate: null }));
});

test("create rejects immutable and unknown fields", async () => {
  const { validateCreateTask } = await getValidation();
  for (const field of ["id", "createdAt", "extra"]) {
    assertInvalid(() =>
      validateCreateTask({ ...validCreate, [field]: "not allowed" }),
    );
  }
});

test("query validation accepts documented filters and rejects repeated, blank, unknown, or invalid values", async () => {
  const { validateListQuery } = await getValidation();

  assert.doesNotThrow(() =>
    validateListQuery(
      new URLSearchParams(
        "status=pending&priority=high&tags=work,school&sort=priority",
      ),
    ),
  );
  for (const query of [
    "status=pending&status=completed",
    "status=",
    "priority=urgent",
    "tags=work,,school",
    "tags=Work,work",
    `tags=${Array(11).fill("tag").join(",")}`,
    `tags=${"x".repeat(31)}`,
    "sort=createdAt",
    "unknown=value",
  ]) {
    assertInvalid(() =>
      validateListQuery(new URLSearchParams(query)),
    );
  }
});

test("validation details are ordered by field and then issue", async () => {
  const { validateCreateTask, validateListQuery } = await getValidation();
  const bodyDetails = getValidationDetails(() =>
    validateCreateTask({
      ...validCreate,
      title: "   ",
      priority: "urgent",
      id: "client-id",
      createdAt: "client-date",
      unexpected: true,
    }),
  );
  const queryDetails = getValidationDetails(() =>
    validateListQuery(
      new URLSearchParams(
        "status=unknown&priority=urgent&sort=createdAt&extra=value",
      ),
    ),
  );

  assert.ok(bodyDetails.length > 1);
  assert.ok(queryDetails.length > 1);
  assertDetailsSorted(bodyDetails);
  assertDetailsSorted(queryDetails);
});
