import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { evaluationCases } from "../../src/evaluation/cases.js";

test("standalone dataset matches all application evaluation cases", async () => {
  const datasetPath = resolve(process.cwd(), "evals", "dataset.json");
  const dataset = JSON.parse(await readFile(datasetPath, "utf8"));

  assert.equal(dataset.datasetVersion, "1.0.0");
  assert.equal(dataset.totalCases, evaluationCases.length);
  assert.equal(dataset.cases.length, evaluationCases.length);

  assert.deepEqual(
    dataset.cases,
    JSON.parse(JSON.stringify(evaluationCases)),
    "The standalone dataset must match the complete application cases, including expected outcomes."
  );
});
