import { createRequire } from "node:module";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";
import type { FormatsPlugin } from "ajv-formats";

export interface SchemaValidationResult {
  valid: boolean;
  issues: string[];
}

export const responseSchema: AnySchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Natural-Language Reminder Interpretation",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "status",
    "reminder",
    "clarificationQuestions",
    "reason",
  ],
  properties: {
    schemaVersion: { const: "1.0" },
    status: {
      enum: ["ready", "needs_clarification", "rejected"],
    },
    reminder: {
      oneOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["title", "recipient", "scheduledAt", "timeZone"],
          properties: {
            title: {
              type: "string",
              minLength: 1,
              maxLength: 500,
              pattern: "\\S",
            },
            recipient: {
              type: ["string", "null"],
              maxLength: 200,
            },
            scheduledAt: {
              type: ["string", "null"],
              format: "date-time",
              pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
            },
            timeZone: {
              type: ["string", "null"],
              maxLength: 100,
            },
          },
        },
      ],
    },
    clarificationQuestions: {
      type: "array",
      maxItems: 5,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 300,
      },
    },
    reason: {
      type: ["string", "null"],
      maxLength: 1000,
    },
  },
  allOf: [
    {
      if: {
        properties: { status: { const: "ready" } },
        required: ["status"],
      },
      then: {
        properties: {
          reminder: {
            type: "object",
            properties: {
              title: {
                type: "string",
                minLength: 1,
                pattern: "\\S",
              },
              recipient: {
                type: "string",
                minLength: 1,
                pattern: "\\S",
              },
              scheduledAt: {
                type: "string",
                format: "date-time",
                pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
              },
              timeZone: {
                type: "string",
                minLength: 1,
              },
            },
          },
          clarificationQuestions: { maxItems: 0 },
          reason: { type: "null" },
        },
      },
    },
    {
      if: {
        properties: { status: { const: "needs_clarification" } },
        required: ["status"],
      },
      then: {
        properties: {
          clarificationQuestions: { minItems: 1 },
          reason: { type: "null" },
        },
      },
    },
    {
      if: {
        properties: { status: { const: "rejected" } },
        required: ["status"],
      },
      then: {
        properties: {
          reminder: { type: "null" },
          clarificationQuestions: { maxItems: 0 },
          reason: { type: "string", minLength: 1 },
        },
      },
    },
  ],
};

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictTypes: false,
});
const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as FormatsPlugin;
addFormats(ajv);

const validate = ajv.compile(responseSchema);

export function validateResponse(value: unknown): SchemaValidationResult {
  const valid = validate(value);
  if (valid) {
    return { valid: true, issues: [] };
  }

  const issues = (validate.errors ?? []).map((error) => {
    const location = error.instancePath || "/";
    return `${location} ${error.message ?? "is invalid"}`;
  });
  return { valid: false, issues };
}
