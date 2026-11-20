import { strict as assert } from "node:assert";
import { test } from "node:test";
import type {
  ReminderInterpretation,
  ReminderRequest,
} from "../../src/contracts/types.js";
import { validateInvariants } from "../../src/validation/invariants.js";

const request: ReminderRequest = {
  text: "Remind me to call Rahul tomorrow at 10 AM.",
  referenceDateTime: "2026-11-20T12:00:00.000Z",
  timeZone: "Asia/Kolkata",
};

const ready: ReminderInterpretation = {
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

test("accepts a complete future ready response", () => {
  assert.equal(validateInvariants(ready, request).valid, true);
});

test("rejects impossible and non-canonical UTC timestamps", () => {
  const impossible = {
    ...ready,
    reminder: { ...ready.reminder!, scheduledAt: "2026-02-30T10:00:00.000Z" },
  };
  const offset = {
    ...ready,
    reminder: { ...ready.reminder!, scheduledAt: "2026-11-21T04:30:00+00:00" },
  };
  assert.equal(validateInvariants(impossible, request).valid, false);
  assert.equal(validateInvariants(offset, request).valid, false);
});

test("rejects a scheduled instant that is not later than the reference", () => {
  const notFuture = {
    ...ready,
    reminder: {
      ...ready.reminder!,
      scheduledAt: request.referenceDateTime,
    },
  };
  assert.equal(validateInvariants(notFuture, request).valid, false);
});

test("rejects invalid IANA zones and whitespace-only recipients", () => {
  const badZone = {
    ...ready,
    reminder: { ...ready.reminder!, timeZone: "Mars/Olympus" },
  };
  const blankRecipient = {
    ...ready,
    reminder: { ...ready.reminder!, recipient: "   " },
  };
  assert.equal(validateInvariants(badZone, request).valid, false);
  assert.equal(validateInvariants(blankRecipient, request).valid, false);
});

test("requires clarification questions and a null reason for clarification", () => {
  const missingQuestion = {
    schemaVersion: "1.0",
    status: "needs_clarification",
    reminder: null,
    clarificationQuestions: [],
    reason: null,
  };
  const clarificationWithReason = {
    ...missingQuestion,
    clarificationQuestions: ["What time?"],
    reason: "A time is missing.",
  };
  assert.equal(validateInvariants(missingQuestion, request).valid, false);
  assert.equal(validateInvariants(clarificationWithReason, request).valid, false);
});

test("requires rejected responses to have no reminder or questions", () => {
  const invalidRejected = {
    schemaVersion: "1.0",
    status: "rejected",
    reminder: ready.reminder,
    clarificationQuestions: [],
    reason: "Unsupported.",
  };
  assert.equal(validateInvariants(invalidRejected, request).valid, false);
});

test("rejects a ready response when the reference instant is invalid", () => {
  assert.equal(
    validateInvariants(ready, {
      text: request.text,
      referenceDateTime: "2026-02-30T12:00:00.000Z",
      timeZone: "Asia/Kolkata",
    }).valid,
    false,
  );
});
