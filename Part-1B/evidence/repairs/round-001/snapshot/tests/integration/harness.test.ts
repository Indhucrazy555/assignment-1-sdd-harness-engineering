import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

function runHarness(...args: string[]) {
  return spawnSync(
    process.execPath,
    [resolve("scripts/harness.mjs"), ...args],
    { encoding: "utf8" },
  );
}

test("creates write-once evidence manifests and detects altered files", () => {
  const directory = mkdtempSync(join(tmpdir(), "reminder-harness-"));
  const sample = join(directory, "result.json");
  const manifest = join(directory, "manifest.sha256");

  try {
    writeFileSync(sample, '{"outcome":"PASS"}\n', "utf8");
    const created = runHarness("--create-manifest", directory);
    assert.equal(created.status, 0, created.stderr);

    const originalManifest = readFileSync(manifest, "utf8");
    assert.match(originalManifest, /^[a-f0-9]{64}  result\.json\r?\n?$/);
    assert.equal(runHarness("--verify-manifest", directory).status, 0);

    writeFileSync(sample, '{"outcome":"FAIL"}\n', "utf8");
    const modified = runHarness("--verify-manifest", directory);
    assert.notEqual(modified.status, 0);
    assert.match(`${modified.stdout}${modified.stderr}`, /mismatch/i);

    const repeatedCreate = runHarness("--create-manifest", directory);
    assert.notEqual(repeatedCreate.status, 0);
    assert.equal(readFileSync(manifest, "utf8"), originalManifest);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("lists the fixed harness check matrix", () => {
  const result = runHarness("--list-checks");
  assert.equal(result.status, 0, result.stderr);
  const checks = JSON.parse(result.stdout) as Array<{
    name: string;
    command: string;
  }>;
  assert.deepEqual(
    checks.map((check) => check.name),
    ["typecheck", "build", "tests", "evaluation"],
  );
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  assert.ok(checks.some((check) => check.command === `${npmCommand} test`));
  assert.ok(
    checks.some((check) => check.command === `${npmCommand} run evaluate`),
  );
});
