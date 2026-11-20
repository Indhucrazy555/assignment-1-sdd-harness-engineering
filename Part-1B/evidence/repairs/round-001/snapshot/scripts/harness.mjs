import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const manifestName = "manifest.sha256";
const checkDefinitions = [
  { name: "typecheck", args: ["run", "typecheck"] },
  { name: "build", args: ["run", "build"] },
  { name: "tests", args: ["test"] },
  { name: "evaluation", args: ["run", "evaluate"] },
];
const excludedDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "evidence",
]);

function normalizePath(path) {
  return path.split(sep).join("/");
}

function listFiles(directory, relativeDirectory = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    if (
      entry.name === manifestName ||
      entry.name === ".env" ||
      entry.name.startsWith(".env.") ||
      entry.name === "Thumbs.db" ||
      entry.name === ".DS_Store"
    ) {
      continue;
    }

    const absolutePath = join(directory, entry.name);
    const relativePath = join(relativeDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Evidence contains an unsupported symbolic link: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(
        ...listFiles(absolutePath, relativePath),
      );
    } else if (entry.isFile()) {
      files.push(normalizePath(relativePath));
    }
  }
  return files.sort();
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function createManifest(directory) {
  const root = resolve(directory);
  if (!existsSync(root) || !lstatSync(root).isDirectory()) {
    throw new Error("Manifest directory does not exist.");
  }
  const manifestPath = join(root, manifestName);
  if (existsSync(manifestPath)) {
    throw new Error("Evidence manifest already exists and is write-once.");
  }
  const entries = listFiles(root).map((relativePath) => {
    return `${sha256File(join(root, relativePath))}  ${relativePath}`;
  });
  writeFileSync(
    manifestPath,
    entries.length === 0 ? "" : `${entries.join("\n")}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  return manifestPath;
}

export function verifyManifest(directory) {
  const root = resolve(directory);
  const manifestPath = join(root, manifestName);
  if (!existsSync(manifestPath)) {
    return { valid: false, issues: ["Evidence manifest is missing."] };
  }

  const manifestText = readFileSync(manifestPath, "utf8");
  const expected = new Map();
  for (const line of manifestText.split(/\r?\n/).filter(Boolean)) {
    const hash = line.slice(0, 64);
    const relativePath = line.slice(66);
    if (
      !/^[a-f0-9]{64}$/.test(hash) ||
      line.slice(64, 66) !== "  " ||
      relativePath.length === 0 ||
      relativePath.startsWith("/") ||
      relativePath.split("/").includes("..") ||
      expected.has(relativePath)
    ) {
      return {
        valid: false,
        issues: ["Evidence manifest contains an invalid entry."],
      };
    }
    expected.set(relativePath, hash);
  }

  const issues = [];
  let actualFiles;
  try {
    actualFiles = listFiles(root);
  } catch (error) {
    return {
      valid: false,
      issues: [error instanceof Error ? error.message : "Evidence scan failed."],
    };
  }

  const actualSet = new Set(actualFiles);
  for (const relativePath of expected.keys()) {
    if (!actualSet.has(relativePath)) {
      issues.push(`Evidence file is missing: ${relativePath}`);
    } else if (sha256File(join(root, relativePath)) !== expected.get(relativePath)) {
      issues.push(`Evidence hash mismatch: ${relativePath}`);
    }
  }
  for (const relativePath of actualFiles) {
    if (!expected.has(relativePath)) {
      issues.push(`Evidence file is not listed in the manifest: ${relativePath}`);
    }
  }

  return { valid: issues.length === 0, issues };
}

function copySnapshot(source, destination, relativeDirectory = "") {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (
      excludedDirectories.has(entry.name) ||
      entry.name === ".env" ||
      entry.name.startsWith(".env.") ||
      entry.name === "Thumbs.db" ||
      entry.name === ".DS_Store" ||
      entry.name.endsWith(".log")
    ) {
      continue;
    }
    const sourcePath = join(source, entry.name);
    const relativePath = join(relativeDirectory, entry.name);
    const destinationPath = join(destination, relativePath);
    if (entry.isSymbolicLink()) {
      throw new Error(`Implementation snapshot contains a symbolic link: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      copySnapshot(sourcePath, destination, relativePath);
    } else if (entry.isFile()) {
      mkdirSync(dirname(destinationPath), { recursive: true });
      copyFileSync(sourcePath, destinationPath);
    }
  }
}

function writeOnce(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { encoding: "utf8", flag: "wx" });
}

function parseEvaluationOutput(stdout) {
  const lines = stdout.split(/\r?\n/).reverse();
  for (const line of lines) {
    if (!line.trim().startsWith("{")) {
      continue;
    }
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed.runId === "string" && Array.isArray(parsed.cases)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function runCheck(root, definition, checkDirectory) {
  const startedAt = new Date().toISOString();
  const isWindows = process.platform === "win32";
  const executable = isWindows ? process.env.ComSpec ?? "cmd.exe" : "npm";
  const args = isWindows
    ? ["/d", "/s", "/c", `npm.cmd ${definition.args.join(" ")}`]
    : definition.args;
  const commandLine = isWindows
    ? `npm.cmd ${definition.args.join(" ")}`
    : `${executable} ${args.join(" ")}`;
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  const completedAt = new Date().toISOString();
  const exitCode = result.status ?? 1;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const logPath = join(checkDirectory, `${definition.name}.log`);
  const log = [
    `$ ${commandLine}`,
    "",
    "STDOUT",
    stdout,
    "STDERR",
    stderr,
    result.error ? `SPAWN ERROR\n${result.error.message}` : "",
  ].join("\n");
  writeOnce(logPath, log);
  return {
    name: definition.name,
    command: commandLine,
    exitCode,
    outcome: exitCode === 0 ? "PASS" : "FAIL",
    startedAt,
    completedAt,
    log: normalizePath(relative(root, logPath)),
    stdout,
    stderr:
      result.error === undefined
        ? stderr
        : `${stderr}${result.error.message}`,
  };
}

function runDirectoryFor(root, phase, round) {
  if (phase === "repair") {
    if (!/^\d{3}$/.test(round ?? "")) {
      throw new Error("Repair phase requires --round NNN.");
    }
    return join(root, "evidence", "repairs", `round-${round}`);
  }
  if (phase === "initial" || phase === "final") {
    return join(root, "evidence", phase);
  }
  throw new Error("Phase must be initial, repair, or final.");
}

async function retainEvaluationEvidence(root, runDirectory, evaluationRun) {
  if (evaluationRun === null) {
    return [];
  }
  const outputs = [];
  const runPath = join(runDirectory, "evaluation-run.json");
  writeOnce(runPath, `${JSON.stringify(evaluationRun, null, 2)}\n`);
  outputs.push(normalizePath(relative(root, runPath)));

  const casesModulePath = pathToFileURL(
    join(root, "dist", "src", "evaluation", "cases.js"),
  ).href;
  const { evaluationCases } = await import(casesModulePath);
  const inputPath = join(runDirectory, "evaluation-inputs.json");
  writeOnce(
    inputPath,
    `${JSON.stringify(
      evaluationCases.map(({ caseId, input }) => ({ caseId, input })),
      null,
      2,
    )}\n`,
  );
  outputs.push(normalizePath(relative(root, inputPath)));

  if (evaluationRun.outcome === "FAIL") {
    const feedbackModulePath = pathToFileURL(
      join(root, "dist", "src", "evaluation", "feedback.js"),
    ).href;
    const { createFailureFeedback } = await import(feedbackModulePath);
    const feedback = createFailureFeedback(evaluationRun, {
      results: normalizePath(relative(root, runPath)),
      logs: normalizePath(relative(root, join(runDirectory, "checks", "evaluation.log"))),
    });
    if (feedback.length > 0) {
      const feedbackPath = join(runDirectory, "failure-feedback.json");
      writeOnce(feedbackPath, `${JSON.stringify(feedback, null, 2)}\n`);
      outputs.push(normalizePath(relative(root, feedbackPath)));
    }
  }
  return outputs;
}

export async function runHarness({ phase, round }) {
  const root = process.cwd();
  const runDirectory = runDirectoryFor(root, phase, round);
  if (existsSync(runDirectory)) {
    throw new Error("Evidence run directory already exists; evidence is write-once.");
  }
  mkdirSync(runDirectory, { recursive: true });

  copySnapshot(root, join(runDirectory, "snapshot"));
  const checkDirectory = join(runDirectory, "checks");
  mkdirSync(checkDirectory);
  const checks = [];
  for (const definition of checkDefinitions) {
    checks.push(runCheck(root, definition, checkDirectory));
  }

  const evaluationCheck = checks.find((check) => check.name === "evaluation");
  const evaluationRun =
    evaluationCheck === undefined
      ? null
      : parseEvaluationOutput(evaluationCheck.stdout);
  const retainedOutputs = await retainEvaluationEvidence(
    root,
    runDirectory,
    evaluationRun,
  );

  const integrity = {
    outcome: "PASS",
    checkLogsPresent: checks.every((check) => existsSync(join(root, check.log))),
    traceableEvaluationResults:
      evaluationRun === null ||
      (evaluationRun.cases.length === 27 &&
        evaluationRun.cases.every(
          (item, index) =>
            item.caseId === `EVAL-${String(index + 1).padStart(3, "0")}`,
        )),
    retainedOutputs,
  };
  if (!integrity.checkLogsPresent || !integrity.traceableEvaluationResults) {
    integrity.outcome = "FAIL";
  }

  const resultRecord = {
    phase,
    ...(round === undefined ? {} : { round }),
    startedAt: checks[0]?.startedAt ?? new Date().toISOString(),
    completedAt: new Date().toISOString(),
    checks: checks.map(({ stdout, stderr, ...check }) => check),
    evaluationRunId: evaluationRun?.runId ?? null,
    evaluationOutcome: evaluationRun?.outcome ?? "UNAVAILABLE",
    integrity,
    outcome:
      integrity.outcome === "PASS" &&
      checks.every((check) => check.outcome === "PASS") &&
      evaluationRun?.outcome === "PASS"
        ? "PASS"
        : "FAIL",
  };
  writeOnce(
    join(runDirectory, "results.json"),
    `${JSON.stringify(resultRecord, null, 2)}\n`,
  );
  writeOnce(
    join(runDirectory, "integrity.json"),
    `${JSON.stringify(integrity, null, 2)}\n`,
  );

  createManifest(runDirectory);
  const manifestVerification = verifyManifest(runDirectory);
  process.stdout.write(
    `${JSON.stringify(
      {
        phase,
        ...(round === undefined ? {} : { round }),
        outcome:
          resultRecord.outcome === "PASS" && manifestVerification.valid
            ? "PASS"
            : "FAIL",
        evidenceDirectory: normalizePath(relative(root, runDirectory)),
        checks: resultRecord.checks.map(({ name, outcome }) => ({
          name,
          outcome,
        })),
        manifestVerified: manifestVerification.valid,
        manifestIssues: manifestVerification.issues,
      },
      null,
      2,
    )}\n`,
  );
  if (resultRecord.outcome !== "PASS" || !manifestVerification.valid) {
    process.exitCode = 1;
  }
}

function printChecks() {
  process.stdout.write(
    `${JSON.stringify(
      checkDefinitions.map(({ name, args }) => ({
        name,
        command: `${process.platform === "win32" ? "npm.cmd" : "npm"} ${args.join(" ")}`,
      })),
      null,
      2,
    )}\n`,
  );
}

async function main(args) {
  const [mode, directory] = args;
  if (mode === "--create-manifest" && directory) {
    createManifest(directory);
    process.stdout.write(`Created ${manifestName}.\n`);
    return;
  }
  if (mode === "--verify-manifest" && directory) {
    const result = verifyManifest(directory);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.valid) {
      process.exitCode = 1;
    }
    return;
  }
  if (mode === "--list-checks") {
    printChecks();
    return;
  }
  if (mode === "--phase") {
    const phase = args[1];
    const roundIndex = args.indexOf("--round");
    const round = roundIndex < 0 ? undefined : args[roundIndex + 1];
    await runHarness({ phase, round });
    return;
  }
  throw new Error(
    "Use --phase <initial|repair|final>, --create-manifest <dir>, --verify-manifest <dir>, or --list-checks.",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Harness failed."}\n`,
    );
    process.exitCode = 1;
  });
}
