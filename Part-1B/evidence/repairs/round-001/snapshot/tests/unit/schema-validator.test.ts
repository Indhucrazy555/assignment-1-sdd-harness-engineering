import { strict as assert } from "node:assert";
import { test } from "node:test";
import { validateResponse } from "../../src/validation/response-schema.js";

const ready = {
  schemaVersion: "1.0",
  status: "ready",
  reminder: {
    title: "Call Rahul",
    recipient: "me",
    scheduledAt: "2026-11-21T04:30:00.000Z",
    timeZone: "Asia/Kolkata",
  },
  clarificationQuestions: [],
  reason: null,
};

test("accepts a structurally valid ready response", () => {
  assert.equal(validateResponse(ready).valid, true);
});

test("accepts a clarification response with unresolved values null", () => {
  assert.equal(
    validateResponse({
      schemaVersion: "1.0",
      status: "needs_clarification",
      reminder: {
        title: "Call Rahul",
        recipient: "me",
        scheduledAt: null,
        timeZone: "Asia/Kolkata",
      },
      clarificationQuestions: ["What time should I use?"],
      reason: null,
    }).valid,
    true,
  );
});

test("accepts a rejected response with no reminder or questions", () => {
  assert.equal(
    validateResponse({
      schemaVersion: "1.0",
      status: "rejected",
      reminder: null,
      clarificationQuestions: [],
      reason: "Recurring reminders are unsupported.",
    }).valid,
    true,
  );
});

test("rejects extra properties and invalid status combinations", () => {
  assert.equal(validateResponse({ ...ready, extra: true }).valid, false);
  assert.equal(
    validateResponse({ ...ready, status: "needs_clarification" }).valid,
    false,
  );
  assert.equal(
    validateResponse({
      ...ready,
      status: "rejected",
      reason: "Unsupported request.",
    }).valid,
    false,
  );
});

test("rejects malformed types and non-canonical timestamp formats", () => {
  assert.equal(
    validateResponse({ ...ready, clarificationQuestions: "none" }).valid,
    false,
  );
  assert.equal(
    validateResponse({
      ...ready,
      reminder: { ...ready.reminder, scheduledAt: "2026-11-21T04:30:00Z" },
    }).valid,
    false,
  );
});

test("rejects extra properties nested in the reminder", () => {
  assert.equal(
    validateResponse({
      ...ready,
      reminder: { ...ready.reminder, isScheduled: true },
    }).valid,
    false,
  );
});
