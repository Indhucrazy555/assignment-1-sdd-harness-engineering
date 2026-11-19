import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  createReadStream,
  openSync,
  writeSync,
} from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const policyPath = resolve(projectRoot, ".harness/policy.json");
const resultSchemaPath = resolve(
  projectRoot,
  ".harness/schemas/check-result.schema.json",
);
const feedbackSchemaPath = resolve(
  projectRoot,
  ".harness/schemas/agent-feedback.schema.json",
);
const decisionSchemaPath = resolve(
  projectRoot,
  ".harness/schemas/human-decision.schema.json",
);
const snapshotRoots = [
  "src",
  "tests",
  "test",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "eslint.config.mjs",
  ".gitignore",
];
const expectedCheckIds = [
  "syntax",
  "lint",
  "typescript",
  "security-audit",
  "unit-tests",
  "integration-tests",
  "http-contract-tests",
  "coverage",
  "integrity",
];
const requiredTools = {
  syntax: ["typescript"],
  lint: ["eslint", "typescript-eslint"],
  typescript: ["typescript"],
  "security-audit": ["npm"],
  "unit-tests": ["npm", "typescript", "@types/node"],
  "integration-tests": ["npm", "typescript", "@types/node"],
  "http-contract-tests": ["npm", "typescript", "@types/node"],
  coverage: ["npm", "typescript", "@types/node", "c8"],
  integrity: ["typescript"],
};
const testChecks = new Set([
  "unit-tests",
  "integration-tests",
  "http-contract-tests",
  "coverage",
]);
const schemaKeywords = new Set([
  "$defs",
  "$ref",
  "$schema",
  "additionalProperties",
  "allOf",
  "const",
  "else",
  "enum",
  "format",
  "if",
  "items",
  "maximum",
  "maxItems",
  "maxLength",
  "minimum",
  "minItems",
  "minLength",
  "not",
  "pattern",
  "prefixItems",
  "properties",
  "required",
  "then",
  "title",
  "type",
  "uniqueItems",
]);

function usage() {
  return [
    "Usage: node .harness/run.mjs [--phase initial|repair|final] [--round NNN] [--revision NNN] [--output-dir PATH]",
    "       node .harness/run.mjs --validate-decision",
    "The default output directory is .harness/output/<run-id>.",
    "Durable run evidence is written under evidence/<phase>/runs/<run-id>/.",
  ].join("\n");
}

function parseArguments(args) {
  const options = {
    phase: "initial",
    round: undefined,
    revision: undefined,
    outputDir: undefined,
    validateDecision: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }
    if (argument === "--validate-decision") {
      if (args.length !== 1) {
        throw new Error("--validate-decision cannot be combined with other options.");
      }
      options.validateDecision = true;
      continue;
    }

    if (
      argument === "--phase" ||
      argument === "--round" ||
      argument === "--revision" ||
      argument === "--output-dir"
    ) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${argument}.`);
      }

      index += 1;
      if (argument === "--phase") {
        options.phase = value;
      } else if (argument === "--round") {
        options.round = value;
      } else if (argument === "--revision") {
        options.revision = value;
      } else {
        options.outputDir = value;
      }
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!["initial", "repair", "final"].includes(options.phase)) {
    throw new Error(`Unsupported phase: ${options.phase}`);
  }
  if (options.phase === "repair") {
    if (!/^\d{3,}$/.test(options.round ?? "")) {
      throw new Error("Repair phase requires --round with at least three digits.");
    }
  } else if (options.round !== undefined) {
    throw new Error("--round is only valid with --phase repair.");
  }
  if (options.revision !== undefined) {
    if (options.phase !== "final") {
      throw new Error("--revision is only valid with --phase final.");
    }
    if (!/^\d{3,}$/.test(options.revision)) {
      throw new Error("Final snapshot revision must contain at least three digits.");
    }
  }

  return options;
}

function isWindowsCommand(executable) {
  return process.platform === "win32" && /\.(?:cmd|bat)$/i.test(executable);
}

function getSpawnSpec(executable, args) {
  if (!isWindowsCommand(executable)) {
    return { executable, args, windowsHide: true };
  }

  const commandTokens = [executable, ...args];
  if (commandTokens.some((token) => !/^[A-Za-z0-9_.\\/:=@+-]+$/.test(token))) {
    throw new Error("Windows batch commands contain an unsupported argument.");
  }

  return {
    executable: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", ...commandTokens],
    windowsHide: true,
  };
}

function resolveCommand(command, policy) {
  if (command.executable !== "npm") {
    return { executable: command.executable, args: [...command.args] };
  }

  const platformName = process.platform === "win32" ? "windows" : "other";
  const resolvedExecutable =
    policy.executableResolution?.npm?.[platformName] ?? command.executable;
  return { executable: resolvedExecutable, args: [...command.args] };
}

function validatePolicy(policy) {
  if (!Array.isArray(policy.checks) || policy.checks.length !== 9) {
    throw new Error("Policy must define exactly nine checks.");
  }
  if (policy.continueAfterFailure !== true) {
    throw new Error("Policy must continue safe checks after a failure.");
  }
  const toolNames = new Set([
    "node",
    "npm",
    ...Object.values(requiredTools).flat(),
  ]);
  for (const tool of toolNames) {
    if (typeof policy.supportedVersions?.[tool] !== "string") {
      throw new Error(`Policy is missing a supported version for ${tool}.`);
    }
  }

  for (const [index, check] of policy.checks.entries()) {
    if (
      check.order !== index + 1 ||
      check.id !== expectedCheckIds[index] ||
      typeof check.command?.executable !== "string" ||
      !Array.isArray(check.command.args) ||
      check.command.args.some((argument) => typeof argument !== "string")
    ) {
      throw new Error(
        `Invalid policy check at position ${index + 1}; expected order ${index + 1} and ID ${expectedCheckIds[index]}.`,
      );
    }
  }

  if (policy.missingCheckOutcome !== "BLOCKED") {
    throw new Error('Policy missingCheckOutcome must be "BLOCKED".');
  }
}

function runVersionCommand(executable, args, cwd) {
  try {
    const spawnSpec = getSpawnSpec(executable, args);
    const result = spawnSync(spawnSpec.executable, spawnSpec.args, {
      cwd,
      encoding: "utf8",
      windowsHide: spawnSpec.windowsHide,
    });

    if (result.error || result.status !== 0) {
      return null;
    }

    const version = result.stdout.trim().split(/\r?\n/).pop();
    return version || null;
  } catch {
    return null;
  }
}

async function readPackageVersion(packagePath) {
  try {
    const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
    return typeof packageJson.version === "string" ? packageJson.version : null;
  } catch {
    return null;
  }
}

async function collectToolVersions(policy) {
  const npmExecutable =
    process.platform === "win32"
      ? policy.executableResolution?.npm?.windows ?? "npm.cmd"
      : policy.executableResolution?.npm?.other ?? "npm";
  const nodeModules = resolve(projectRoot, "node_modules");
  const packageVersion = (name) =>
    readPackageVersion(resolve(nodeModules, ...name.split("/"), "package.json"));

  return {
    node: process.version,
    npm: runVersionCommand(npmExecutable, ["--version"], projectRoot),
    typescript: await packageVersion("typescript"),
    "@types/node": await packageVersion("@types/node"),
    eslint: await packageVersion("eslint"),
    "typescript-eslint": await packageVersion("typescript-eslint"),
    c8: await packageVersion("c8"),
  };
}

function versionParts(version) {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\+.*)?$/.exec(version);
  return match ? match.slice(1, 4).map((part) => Number(part ?? 0)) : undefined;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] < right[index] ? -1 : 1;
    }
  }
  return 0;
}

function isSupportedVersion(actual, requirement) {
  if (!actual || !requirement) {
    return false;
  }
  if (!/[<>]=?/.test(requirement)) {
    return actual.replace(/^v/, "") === requirement;
  }

  const clauses = [
    ...requirement.matchAll(/(>=|<=|>|<)\s*(\d+(?:\.\d+){0,2})/g),
  ];
  if (
    clauses.length === 0 ||
    requirement
      .replace(/(>=|<=|>|<)\s*(\d+(?:\.\d+){0,2})/g, "")
      .trim() !== ""
  ) {
    return false;
  }

  const actualParts = versionParts(actual);
  if (!actualParts) {
    return false;
  }

  return clauses.every(([, operator, boundary]) => {
    const boundaryParts = versionParts(boundary);
    if (!boundaryParts) {
      return false;
    }
    const comparison = compareVersions(actualParts, boundaryParts);
    switch (operator) {
      case ">":
        return comparison > 0;
      case ">=":
        return comparison >= 0;
      case "<":
        return comparison < 0;
      case "<=":
        return comparison <= 0;
      default:
        return false;
    }
  });
}

export function missingToolReason(checkId, versions, policy) {
  const required = new Set(["node", ...requiredTools[checkId]]);
  const unavailable = [];
  const unsupported = [];

  for (const tool of required) {
    const actual = versions[tool];
    const supported = policy.supportedVersions[tool];
    if (actual === null) {
      unavailable.push(`${tool} (expected ${supported})`);
    } else if (!isSupportedVersion(actual, supported)) {
      unsupported.push(`${tool} ${actual} (expected ${supported})`);
    }
  }

  if (unavailable.length === 0 && unsupported.length === 0) {
    return undefined;
  }

  const problems = [];
  if (unavailable.length > 0) {
    problems.push(`unavailable: ${unavailable.join(", ")}`);
  }
  if (unsupported.length > 0) {
    problems.push(`unsupported: ${unsupported.join(", ")}`);
  }
  return {
    kind: unavailable.length > 0 ? "missing-tool" : "other",
    reason: `Required tool version check failed (${problems.join("; ")}).`,
  };
}

function validateJsonValue(value, schema, rootSchema, location, errors) {
  if (schema === false) {
    errors.push(`${location} is not allowed.`);
    return;
  }
  if (schema === true) {
    return;
  }
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    errors.push(`Invalid schema at ${location}.`);
    return;
  }

  for (const keyword of Object.keys(schema)) {
    if (!schemaKeywords.has(keyword)) {
      errors.push(`Unsupported schema keyword ${keyword} at ${location}.`);
    }
  }

  if (schema.$ref !== undefined) {
    if (typeof schema.$ref !== "string" || !schema.$ref.startsWith("#/")) {
      errors.push(`Unsupported schema reference at ${location}.`);
    } else {
      const target = schema.$ref
        .slice(2)
        .split("/")
        .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
        .reduce((current, part) => current?.[part], rootSchema);
      if (target === undefined) {
        errors.push(`Unresolved schema reference ${schema.$ref} at ${location}.`);
      } else {
        validateJsonValue(value, target, rootSchema, location, errors);
      }
    }
  }

  if (schema.type !== undefined) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const matchesType = allowedTypes.some((type) => {
      if (type === "null") {
        return value === null;
      }
      if (type === "array") {
        return Array.isArray(value);
      }
      if (type === "object") {
        return value !== null && typeof value === "object" && !Array.isArray(value);
      }
      if (type === "integer") {
        return Number.isInteger(value);
      }
      if (type === "number") {
        return typeof value === "number" && Number.isFinite(value);
      }
      return typeof value === type;
    });
    if (!matchesType) {
      errors.push(`${location} has an invalid type.`);
      return;
    }
  }

  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    errors.push(`${location} does not match its required constant.`);
  }
  if (
    schema.enum !== undefined &&
    !schema.enum.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))
  ) {
    errors.push(`${location} is not an allowed value.`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && Array.from(value).length < schema.minLength) {
      errors.push(`${location} is shorter than minLength ${schema.minLength}.`);
    }
    if (schema.maxLength !== undefined && Array.from(value).length > schema.maxLength) {
      errors.push(`${location} exceeds maxLength ${schema.maxLength}.`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${location} does not match the required pattern.`);
    }
    if (
      schema.format === "date-time" &&
      (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value,
      ) ||
        Number.isNaN(Date.parse(value)))
    ) {
      errors.push(`${location} is not a valid date-time.`);
    } else if (schema.format !== undefined && schema.format !== "date-time") {
      errors.push(`Unsupported schema format ${schema.format} at ${location}.`);
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${location} is less than ${schema.minimum}.`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${location} exceeds ${schema.maximum}.`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${location} has fewer than ${schema.minItems} items.`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${location} has more than ${schema.maxItems} items.`);
    }
    if (
      schema.uniqueItems === true &&
      new Set(value.map((item) => JSON.stringify(item))).size !== value.length
    ) {
      errors.push(`${location} contains duplicate items.`);
    }

    for (const [index, itemSchema] of (schema.prefixItems ?? []).entries()) {
      if (index < value.length) {
        validateJsonValue(
          value[index],
          itemSchema,
          rootSchema,
          `${location}[${index}]`,
          errors,
        );
      }
    }

    const firstUnspecifiedIndex = schema.prefixItems?.length ?? 0;
    if (schema.items === false && value.length > firstUnspecifiedIndex) {
      errors.push(`${location} contains an item not allowed by the schema.`);
    } else if (schema.items !== undefined && schema.items !== false) {
      for (let index = firstUnspecifiedIndex; index < value.length; index += 1) {
        validateJsonValue(
          value[index],
          schema.items,
          rootSchema,
          `${location}[${index}]`,
          errors,
        );
      }
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        errors.push(`${location}.${required} is required.`);
      }
    }

    const properties = schema.properties ?? {};
    for (const [name, propertyValue] of Object.entries(value)) {
      if (Object.hasOwn(properties, name)) {
        validateJsonValue(
          propertyValue,
          properties[name],
          rootSchema,
          `${location}.${name}`,
          errors,
        );
      } else if (schema.additionalProperties === false) {
        errors.push(`${location}.${name} is not allowed.`);
      } else if (schema.additionalProperties !== undefined) {
        validateJsonValue(
          propertyValue,
          schema.additionalProperties,
          rootSchema,
          `${location}.${name}`,
          errors,
        );
      }
    }
  }

  for (const [index, itemSchema] of (schema.allOf ?? []).entries()) {
    validateJsonValue(value, itemSchema, rootSchema, `${location}.allOf[${index}]`, errors);
  }

  if (schema.if !== undefined) {
    const conditionErrors = [];
    validateJsonValue(value, schema.if, rootSchema, location, conditionErrors);
    const branch = conditionErrors.length === 0 ? schema.then : schema.else;
    if (branch !== undefined) {
      validateJsonValue(value, branch, rootSchema, location, errors);
    }
  }

  if (schema.not !== undefined) {
    const notErrors = [];
    validateJsonValue(value, schema.not, rootSchema, location, notErrors);
    if (notErrors.length === 0) {
      errors.push(`${location} matches a prohibited schema.`);
    }
  }
}

export function validateSchemaDocument(value, schema, schemaName) {
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    throw new Error(`${schemaName} must use JSON Schema Draft 2020-12.`);
  }

  const errors = [];
  validateJsonValue(value, schema, schema, "$", errors);
  if (errors.length > 0) {
    throw new Error(
      `${schemaName} validation failed:\n${errors.join("\n")}`,
    );
  }
}

export function validateRunResult(result, schema) {
  validateSchemaDocument(result, schema, "Run result");
}

export function validateHumanDecisionRecord(decision, schema) {
  validateSchemaDocument(decision, schema, "Human decision");
}

async function readLogExcerpt(logPath, limit = 4000) {
  const handle = await open(logPath, "r");
  try {
    const stats = await handle.stat();
    if (stats.size === 0) {
      return "";
    }

    const byteCount = Math.min(stats.size, limit);
    const buffer = Buffer.alloc(byteCount);
    await handle.read(buffer, 0, byteCount, Math.max(0, stats.size - byteCount));
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

function relativeReference(filePath) {
  return relative(projectRoot, filePath).split(sep).join("/");
}

function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

function isWithinDirectory(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return (
    !isAbsolute(pathFromRoot) &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`)
  );
}

async function pathExists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function compareFileHashes(left, right, description) {
  const leftPaths = [...left.keys()].sort();
  const rightPaths = [...right.keys()].sort();
  if (JSON.stringify(leftPaths) !== JSON.stringify(rightPaths)) {
    throw new Error(`${description} file inventory does not match its manifest.`);
  }

  for (const path of leftPaths) {
    if (left.get(path) !== right.get(path)) {
      throw new Error(`${description} hash mismatch for ${path}.`);
    }
  }
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function collectDirectoryHashes(directory, relativeDirectory = "") {
  const hashes = new Map();
  const entries = (await readdir(directory, { withFileTypes: true })).sort(
    (left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
  );

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    if (entry.isSymbolicLink()) {
      throw new Error(`Snapshot does not support symbolic links: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      for (const [path, hash] of await collectDirectoryHashes(
        entryPath,
        relativePath,
      )) {
        hashes.set(path, hash);
      }
    } else if (entry.isFile()) {
      hashes.set(relativePath.split(sep).join("/"), await hashFile(entryPath));
    } else {
      throw new Error(`Snapshot contains an unsupported file type: ${relativePath}`);
    }
  }

  return hashes;
}

async function collectSourceDirectoryFiles(directory, relativeDirectory = "") {
  const files = [];
  const entries = (await readdir(directory, { withFileTypes: true })).sort(
    (left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
  );

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    if (entry.isSymbolicLink()) {
      throw new Error(`Snapshot does not support symbolic links: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(
        ...(await collectSourceDirectoryFiles(entryPath, relativePath)),
      );
    } else if (entry.isFile()) {
      files.push({
        path: relativePath.split(sep).join("/"),
        content: await readFile(entryPath),
      });
    } else {
      throw new Error(`Snapshot contains an unsupported file type: ${relativePath}`);
    }
  }

  return files;
}

async function collectSnapshotSourceFiles(root) {
  const files = [];
  for (const relativeRoot of snapshotRoots) {
    const sourcePath = resolve(root, relativeRoot);
    let stats;
    try {
      stats = await lstat(sourcePath);
    } catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`Snapshot source cannot be a symbolic link: ${relativeRoot}`);
    }
    if (stats.isDirectory()) {
      files.push(
        ...(await collectSourceDirectoryFiles(sourcePath, relativeRoot)),
      );
    } else if (stats.isFile()) {
      files.push({
        path: relativeRoot,
        content: await readFile(sourcePath),
      });
    } else {
      throw new Error(`Unsupported snapshot source: ${relativeRoot}`);
    }
  }

  files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  if (!files.some((file) => file.path.startsWith("src/"))) {
    throw new Error("Cannot snapshot an implementation before src/ contains source files.");
  }
  return files.map((file) => ({ ...file, sha256: hashContent(file.content) }));
}

function manifestContents(files) {
  const entries = [...files]
    .sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    )
    .map((file) => `${file.sha256}  ${file.path}`);
  return `${entries.join("\n")}\n`;
}

function parseSha256Manifest(contents, manifestName) {
  const hashes = new Map();
  const lines = contents.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) {
    throw new Error(`${manifestName} is empty.`);
  }

  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([^\r\n]+)$/.exec(line);
    if (!match) {
      throw new Error(`${manifestName} contains an invalid entry.`);
    }
    const relativePath = match[2];
    const segments = relativePath.split("/");
    if (
      relativePath.includes("\\") ||
      relativePath.startsWith("/") ||
      segments.some((segment) => segment === "" || segment === "." || segment === "..") ||
      hashes.has(relativePath)
    ) {
      throw new Error(`${manifestName} contains an unsafe or duplicate path.`);
    }
    hashes.set(relativePath, match[1]);
  }

  return hashes;
}

async function hashesForDirectory(directory) {
  return collectDirectoryHashes(directory);
}

export async function captureOrVerifySnapshot(rootPath, phasePath, runId) {
  const root = resolve(rootPath);
  const phaseDirectory = resolve(root, phasePath);
  if (!isWithinDirectory(root, phaseDirectory)) {
    throw new Error("Evidence snapshot directory must remain inside the project root.");
  }

  await mkdir(phaseDirectory, { recursive: true });
  const snapshotDirectory = resolve(phaseDirectory, "implementation");
  const manifestPath = resolve(phaseDirectory, "implementation.sha256");
  const hasSnapshot = await pathExists(snapshotDirectory);
  const hasManifest = await pathExists(manifestPath);

  if (hasSnapshot || hasManifest) {
    if (!hasSnapshot || !hasManifest) {
      throw new Error(
        `Incomplete snapshot evidence at ${phasePath}; refusing to overwrite it.`,
      );
    }
    const [snapshotStats, manifestStats] = await Promise.all([
      lstat(snapshotDirectory),
      lstat(manifestPath),
    ]);
    if (!snapshotStats.isDirectory() || manifestStats.isSymbolicLink() || !manifestStats.isFile()) {
      throw new Error(
        `Snapshot evidence at ${phasePath} contains an invalid file type.`,
      );
    }

    const recordedHashes = parseSha256Manifest(
      await readFile(manifestPath, "utf8"),
      `${phasePath}/implementation.sha256`,
    );
    const snapshotHashes = await hashesForDirectory(snapshotDirectory);
    compareFileHashes(
      recordedHashes,
      snapshotHashes,
      `${phasePath}/implementation snapshot`,
    );
    const currentFiles = await collectSnapshotSourceFiles(root);
    compareFileHashes(
      recordedHashes,
      new Map(currentFiles.map((file) => [file.path, file.sha256])),
      `Current source versus ${phasePath}/implementation`,
    );
    return { snapshotDirectory, manifestPath, reused: true };
  }

  const files = await collectSnapshotSourceFiles(root);
  const stagingDirectory = resolve(phaseDirectory, `.snapshot-stage-${runId}`);
  await mkdir(stagingDirectory);
  try {
    const stagedSnapshot = resolve(stagingDirectory, "implementation");
    await mkdir(stagedSnapshot);
    for (const file of files) {
      const destination = resolve(stagedSnapshot, ...file.path.split("/"));
      if (!isWithinDirectory(stagedSnapshot, destination)) {
        throw new Error(`Unsafe snapshot path: ${file.path}`);
      }
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, file.content, { flag: "wx" });
    }
    await writeFile(
      resolve(stagingDirectory, "implementation.sha256"),
      manifestContents(files),
      { flag: "wx" },
    );
    await rename(stagedSnapshot, snapshotDirectory);
    await rename(
      resolve(stagingDirectory, "implementation.sha256"),
      manifestPath,
    );
    await rm(stagingDirectory, { recursive: true });
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }

  return { snapshotDirectory, manifestPath, reused: false };
}

function phaseEvidencePath(phase, round) {
  if (phase === "repair") {
    return `evidence/repairs/round-${round}`;
  }
  return `evidence/${phase}`;
}

function snapshotEvidencePath(phasePath, revision) {
  return revision === undefined
    ? phasePath
    : `${phasePath}/revisions/${revision}`;
}

function feedbackFailureKind(kind) {
  const supportedKinds = new Set([
    "assertion",
    "process",
    "audit",
    "integrity",
    "timeout",
    "dependency",
    "other",
  ]);
  if (supportedKinds.has(kind)) {
    return kind;
  }
  if (kind === "skipped-test") {
    return "assertion";
  }
  if (kind === "missing-tool") {
    return "dependency";
  }
  return "other";
}

export function buildAgentFeedback(result, policy, resultReference, schema) {
  const failures = result.checks.filter((check) => check.outcome === "FAIL");
  if (failures.length === 0) {
    return undefined;
  }

  const feedback = {
    feedback_version: 1,
    run_id: result.run_id,
    generated_at_utc: new Date().toISOString(),
    failures: failures.map((check) => {
      const failureDetails = check.failure_details;
      const excerpt =
        failureDetails?.output_excerpt?.trim() ||
        failureDetails?.summary ||
        `Command exited with code ${check.exit_code}.`;
      const failure = {
        check_id: check.check_id,
        outcome: "FAIL",
        ...(failureDetails?.kind
          ? { failure_kind: feedbackFailureKind(failureDetails.kind) }
          : {}),
        command: check.command,
        expected_reference: [
          `.harness/policy.json#/checks/${check.order - 1}`,
        ],
        expected_behavior: testChecks.has(check.check_id)
          ? "The policy-defined tests pass without skipped, todo, or cancelled cases; coverage satisfies the fixed thresholds when applicable."
          : "The policy-defined check completes successfully without reporting a policy violation.",
        observed_behavior: `${failureDetails?.summary ?? "The check failed."} Exit code: ${check.exit_code}.`,
        evidence: {
          check_result: resultReference,
          stdout_log: check.logs.stdout,
          stderr_log: check.logs.stderr,
          failure_excerpt: excerpt,
        },
      };
      if (failureDetails?.failed_test_ids) {
        failure.failed_test_ids = failureDetails.failed_test_ids;
      }
      return failure;
    }),
  };

  validateSchemaDocument(feedback, schema, "AI failure feedback");
  return feedback;
}

export async function validateHumanDecisionFile(
  evidenceDirectory,
  decisionSchema,
  resultSchema,
) {
  const decisionPath = resolve(evidenceDirectory, "human-decision.json");
  const decision = JSON.parse(await readFile(decisionPath, "utf8"));
  validateHumanDecisionRecord(decision, decisionSchema);

  const finalRunsDirectory = resolve(evidenceDirectory, "final", "runs");
  let runDirectories;
  try {
    runDirectories = await readdir(finalRunsDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("No final harness run exists for the human decision.");
    }
    throw error;
  }

  const finalRuns = [];
  for (const entry of runDirectories) {
    if (!entry.isDirectory()) {
      continue;
    }
    const resultPath = resolve(finalRunsDirectory, entry.name, "results.json");
    if (!(await pathExists(resultPath))) {
      continue;
    }
    const result = JSON.parse(await readFile(resultPath, "utf8"));
    validateRunResult(result, resultSchema);
    finalRuns.push(result);
  }

  finalRuns.sort((left, right) =>
    right.completed_at_utc.localeCompare(left.completed_at_utc) ||
    right.run_id.localeCompare(left.run_id),
  );
  const latestFinalRun = finalRuns[0];
  if (!latestFinalRun) {
    throw new Error("No complete final harness run exists for the human decision.");
  }
  if (decision.run_id !== latestFinalRun.run_id) {
    throw new Error(
      `Human decision run_id must reference the latest final run ${latestFinalRun.run_id}.`,
    );
  }
  if (
    decision.decision === "ACCEPT" &&
    (latestFinalRun.outcome !== "PASS" ||
      latestFinalRun.checks.some((check) => check.outcome !== "PASS"))
  ) {
    throw new Error("ACCEPT is valid only when every check in the final run passes.");
  }

  return decision;
}

async function createRunManifest(runDirectory) {
  const hashes = await collectDirectoryHashes(runDirectory);
  const manifestFiles = [...hashes]
    .filter(([path]) => path !== "run.sha256")
    .map(([path, sha256]) => ({ path, sha256 }));
  await writeFile(
    resolve(runDirectory, "run.sha256"),
    manifestContents(manifestFiles),
    { flag: "wx" },
  );
}

export async function persistRunEvidence(
  runDirectory,
  result,
  policy,
  resultSchema,
  feedbackSchema,
  snapshotManifest,
) {
  validateRunResult(result, resultSchema);
  const resultPath = resolve(runDirectory, "results.json");
  const runLogPath = resolve(runDirectory, "run.log");
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, {
    flag: "wx",
  });
  await writeFile(runLogPath, formatRunLog(result, snapshotManifest), {
    flag: "wx",
  });

  const feedback = buildAgentFeedback(
    result,
    policy,
    relativeReference(resultPath),
    feedbackSchema,
  );
  if (feedback) {
    await writeFile(
      resolve(runDirectory, "agent-feedback.json"),
      `${JSON.stringify(feedback, null, 2)}\n`,
      { flag: "wx" },
    );
  }
  await createRunManifest(runDirectory);
  return {
    resultPath,
    runLogPath,
    feedbackPath: feedback
      ? resolve(runDirectory, "agent-feedback.json")
      : undefined,
  };
}

function checkFailureKind(checkId, exitCode, processError, outputExcerpt) {
  if (processError?.code === "ENOENT") {
    return "missing-tool";
  }
  if (checkId === "security-audit") {
    return "audit";
  }
  if (checkId === "integrity") {
    return "integrity";
  }
  if (
    testChecks.has(checkId) &&
    /(?:AssertionError|ERR_ASSERTION|\bnot ok\b|coverage threshold)/i.test(outputExcerpt)
  ) {
    return "assertion";
  }
  return exitCode === null ? "other" : "process";
}

function reportsSkippedTests(outputExcerpt) {
  return (
    /(?:^|\r?\n)\s*(?:#|ℹ)\s*(?:skipped|todo|cancelled)\s+[1-9]\d*\b/im.test(
      outputExcerpt,
    ) ||
    /#\s*(?:SKIP|TODO|CANCELLED)\b/i.test(outputExcerpt)
  );
}

function makeFailureDetails({
  checkId,
  exitCode,
  processError,
  outputExcerpt,
  summary,
  kind,
}) {
  const details = {
    kind:
      kind ??
        checkFailureKind(checkId, exitCode, processError, outputExcerpt),
    summary,
  };

  if (processError) {
    details.process_error = processError.message;
  }
  if (outputExcerpt) {
    details.output_excerpt = outputExcerpt;
  }

  return details;
}

export function evaluateProcessOutcome(checkId, processResult, outputExcerpt) {
  const { exitCode, signal, processError } = processResult;

  if (processError || exitCode === null) {
    const summary = processError
      ? `Unable to start command: ${processError.message}`
      : signal
        ? `Command terminated by signal ${signal}.`
        : "Command completed without an exit code.";
    return {
      outcome: "BLOCKED",
      exitCode: null,
      failureDetails: makeFailureDetails({
        checkId,
        exitCode: null,
        processError,
        outputExcerpt,
        summary,
      }),
    };
  }

  if (checkId === "integrity" && exitCode === 2) {
    return {
      outcome: "BLOCKED",
      exitCode: null,
      failureDetails: makeFailureDetails({
        checkId,
        exitCode: null,
        outputExcerpt,
        summary: "Integrity check returned its reserved BLOCKED exit code 2.",
        kind: "integrity",
      }),
    };
  }

  const skippedTests =
    testChecks.has(checkId) && reportsSkippedTests(outputExcerpt);
  if (skippedTests) {
    return {
      outcome: "FAIL",
      exitCode,
      failureDetails: makeFailureDetails({
        checkId,
        exitCode,
        outputExcerpt,
        summary: `Command exited with code ${exitCode} but reported skipped, todo, or cancelled tests.`,
        kind: "skipped-test",
      }),
    };
  }

  if (exitCode === 0) {
    return { outcome: "PASS", exitCode };
  }

  return {
    outcome: "FAIL",
    exitCode,
    failureDetails: makeFailureDetails({
      checkId,
      exitCode,
      outputExcerpt,
      summary: `Command exited with code ${exitCode}.`,
    }),
  };
}

async function runProcess(command, stdoutPath, stderrPath) {
  const spawnSpec = getSpawnSpec(command.executable, command.args);
  const stdoutFd = openSync(stdoutPath, "wx");
  let stderrFd;
  try {
    stderrFd = openSync(stderrPath, "wx");
  } catch (error) {
    closeSync(stdoutFd);
    throw error;
  }
  let child;

  try {
    child = spawn(spawnSpec.executable, spawnSpec.args, {
      cwd: projectRoot,
      stdio: ["ignore", stdoutFd, stderrFd],
      windowsHide: spawnSpec.windowsHide,
    });
  } catch (error) {
    writeSync(stderrFd, `${error.message}\n`);
    closeSync(stdoutFd);
    closeSync(stderrFd);
    return {
      exitCode: null,
      signal: null,
      processError: error,
    };
  }
  closeSync(stdoutFd);
  closeSync(stderrFd);

  return new Promise((resolveResult) => {
    let processError;
    let settled = false;
    const complete = (result) => {
      if (!settled) {
        settled = true;
        resolveResult({ ...result, processError });
      }
    };

    child.once("error", (error) => {
      processError = error;
      complete({ exitCode: null, signal: null });
    });
    child.once("close", (exitCode, signal) => {
      complete({ exitCode, signal });
    });
  });
}

async function writeBlockedLogs(stdoutPath, stderrPath, message) {
  await Promise.all([
    writeFile(stdoutPath, "", { flag: "wx" }),
    writeFile(stderrPath, `${message}\n`, { flag: "wx" }),
  ]);
}

export function dependencyBlock(checkId, versions, completedChecks, policy) {
  const toolIssue = missingToolReason(checkId, versions, policy);
  if (toolIssue) {
    return toolIssue;
  }

  if (testChecks.has(checkId) && checkId !== "coverage") {
    const typecheck = completedChecks.get("typescript");
    if (typecheck?.outcome !== "PASS") {
      return {
        kind: "other",
        reason: `Blocked because the TypeScript prerequisite outcome was ${typecheck?.outcome ?? "unavailable"}.`,
      };
    }
  }
  if (checkId === "coverage") {
    const typecheck = completedChecks.get("typescript");
    if (typecheck?.outcome !== "PASS") {
      return {
        kind: "other",
        reason: `Blocked because the TypeScript prerequisite outcome was ${typecheck?.outcome ?? "unavailable"}.`,
      };
    }
  }

  return undefined;
}

async function executeCheck({
  check,
  order,
  policy,
  versions,
  completedChecks,
  logDirectory,
}) {
  const command = resolveCommand(check.command, policy);
  const stdoutPath = resolve(logDirectory, `${check.id}.stdout.log`);
  const stderrPath = resolve(logDirectory, `${check.id}.stderr.log`);
  const startedAt = new Date().toISOString();
  const blockedReason = dependencyBlock(
    check.id,
    versions,
    completedChecks,
    policy,
  );
  let outcome;
  let exitCode = null;
  let failureDetails;

  if (blockedReason) {
    await writeBlockedLogs(
      stdoutPath,
      stderrPath,
      `BLOCKED: ${blockedReason.reason}`,
    );
    outcome = "BLOCKED";
    failureDetails = makeFailureDetails({
      checkId: check.id,
      exitCode: null,
      outputExcerpt: `BLOCKED: ${blockedReason.reason}`,
      summary: blockedReason.reason,
      kind: blockedReason.kind,
    });
  } else {
    let processResult;
    try {
      processResult = await runProcess(command, stdoutPath, stderrPath);
    } catch (error) {
      await Promise.all([
        writeFile(stdoutPath, "", { flag: "wx" }),
        writeFile(stderrPath, `${error.message}\n`, { flag: "wx" }),
      ]);
      processResult = {
        exitCode: null,
        signal: null,
        processError: error,
      };
    }

    exitCode = processResult.exitCode;
    const [stdoutExcerpt, stderrExcerpt] = await Promise.all([
      readLogExcerpt(stdoutPath),
      readLogExcerpt(stderrPath),
    ]);
    const outputExcerpt = [
      stdoutExcerpt ? `stdout:\n${stdoutExcerpt}` : "",
      stderrExcerpt ? `stderr:\n${stderrExcerpt}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const evaluation = evaluateProcessOutcome(
      check.id,
      processResult,
      outputExcerpt,
    );
    outcome = evaluation.outcome;
    exitCode = evaluation.exitCode;
    failureDetails = evaluation.failureDetails;
  }

  const completedAt = new Date().toISOString();
  return {
    order,
    check_id: check.id,
    command,
    tool_versions: versions,
    started_at_utc: startedAt,
    completed_at_utc: completedAt,
    outcome,
    exit_code: exitCode,
    logs: {
      stdout: relativeReference(stdoutPath),
      stderr: relativeReference(stderrPath),
    },
    ...(failureDetails ? { failure_details: failureDetails } : {}),
  };
}

function runOutcome(checks) {
  if (checks.some((check) => check.outcome === "FAIL")) {
    return "FAIL";
  }
  if (checks.some((check) => check.outcome === "BLOCKED")) {
    return "BLOCKED";
  }
  return "PASS";
}

function formatRunLog(result, snapshotManifest) {
  const lines = [
    `Run: ${result.run_id}`,
    `Phase: ${result.phase}${result.round ? ` (round ${result.round})` : ""}`,
    `Snapshot manifest: ${snapshotManifest}`,
    `Started: ${result.started_at_utc}`,
    `Completed: ${result.completed_at_utc}`,
    `Outcome: ${result.outcome}`,
    "",
  ];

  for (const check of result.checks) {
    lines.push(
      `${check.order}. ${check.check_id}: ${check.outcome} (exit ${check.exit_code ?? "n/a"})`,
      `   Command: ${check.command.executable} ${check.command.args.join(" ")}`.trimEnd(),
      `   stdout: ${check.logs.stdout}`,
      `   stderr: ${check.logs.stderr}`,
    );
    if (check.failure_details) {
      lines.push(`   Details: ${check.failure_details.summary}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function createOutputDirectory(options, runId) {
  const outputPath = options.outputDir
    ? resolve(projectRoot, options.outputDir)
    : resolve(projectRoot, ".harness/output", runId);
  const relativePath = relative(projectRoot, outputPath);

  if (
    isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`)
  ) {
    throw new Error("Output directory must remain inside the project root.");
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(outputPath);
  const logDirectory = resolve(outputPath, "logs");
  await mkdir(logDirectory);
  return { outputPath, logDirectory };
}

async function createEvidenceRunDirectory(phasePath, runId) {
  const phaseDirectory = resolve(projectRoot, phasePath);
  const runsDirectory = resolve(phaseDirectory, "runs");
  await mkdir(runsDirectory, { recursive: true });

  const runDirectory = resolve(runsDirectory, runId);
  await mkdir(runDirectory);
  const logDirectory = resolve(runDirectory, "logs");
  await mkdir(logDirectory);
  return { runDirectory, logDirectory };
}

async function copyDirectoryContents(sourceDirectory, destinationDirectory) {
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = resolve(sourceDirectory, entry.name);
    const destinationPath = resolve(destinationDirectory, entry.name);
    if (entry.isDirectory()) {
      await mkdir(destinationPath, { recursive: true });
      await copyDirectoryContents(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await writeFile(destinationPath, await readFile(sourcePath), { flag: "wx" });
    } else {
      throw new Error(`Cannot preserve unsupported run artifact: ${sourcePath}`);
    }
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  if (options.validateDecision) {
    const [decisionSchemaContents, runSchemaContents] = await Promise.all([
      readFile(decisionSchemaPath, "utf8"),
      readFile(resultSchemaPath, "utf8"),
    ]);
    await validateHumanDecisionFile(
      resolve(projectRoot, "evidence"),
      JSON.parse(decisionSchemaContents),
      JSON.parse(runSchemaContents),
    );
    console.log("Human decision is valid and references the latest final run.");
    return;
  }

  const [
    policyContents,
    schemaContents,
    feedbackSchemaContents,
  ] = await Promise.all([
    readFile(policyPath, "utf8"),
    readFile(resultSchemaPath, "utf8"),
    readFile(feedbackSchemaPath, "utf8"),
  ]);
  const policy = JSON.parse(policyContents);
  const resultSchema = JSON.parse(schemaContents);
  const feedbackSchema = JSON.parse(feedbackSchemaContents);
  validatePolicy(policy);

  const runId = `run-${new Date().toISOString().replaceAll(/[-:.]/g, "")}-${randomUUID()}`;
  const runStartedAt = new Date().toISOString();
  const phasePath = phaseEvidencePath(options.phase, options.round);
  const snapshotPath = snapshotEvidencePath(phasePath, options.revision);
  await captureOrVerifySnapshot(projectRoot, snapshotPath, runId);
  const snapshotManifest = relativeReference(
    resolve(projectRoot, snapshotPath, "implementation.sha256"),
  );
  const { runDirectory, logDirectory } = await createEvidenceRunDirectory(
    phasePath,
    runId,
  );
  const output = await createOutputDirectory(options, runId);
  if (resolve(output.outputPath) === resolve(runDirectory)) {
    throw new Error("Output directory cannot be the durable evidence run directory.");
  }
  const versions = await collectToolVersions(policy);
  const completedChecks = new Map();
  const checks = [];

  for (const [index, check] of policy.checks.entries()) {
    const result = await executeCheck({
      check,
      order: index + 1,
      policy,
      versions,
      completedChecks,
      logDirectory,
    });
    checks.push(result);
    completedChecks.set(check.id, result);
  }

  const result = {
    run_id: runId,
    phase: options.phase,
    started_at_utc: runStartedAt,
    completed_at_utc: new Date().toISOString(),
    outcome: runOutcome(checks),
    checks,
    ...(options.phase === "repair" ? { round: options.round } : {}),
  };

  const persisted = await persistRunEvidence(
    runDirectory,
    result,
    policy,
    resultSchema,
    feedbackSchema,
    snapshotManifest,
  );
  await copyDirectoryContents(runDirectory, output.outputPath);

  console.log(`Run ${runId}: ${result.outcome}`);
  console.log(`Snapshot: ${snapshotManifest}`);
  console.log(`Results: ${relativeReference(persisted.resultPath)}`);
  console.log(`Log: ${relativeReference(persisted.runLogPath)}`);
  if (persisted.feedbackPath) {
    console.log(
      `AI feedback: ${relativeReference(persisted.feedbackPath)}`,
    );
  }

  if (result.outcome !== "PASS") {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
