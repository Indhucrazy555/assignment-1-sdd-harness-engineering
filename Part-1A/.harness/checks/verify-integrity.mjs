import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const policyPath = ".harness/policy.json";
const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);
const testRoots = new Set([
  "describe",
  "it",
  "specify",
  "suite",
  "test",
]);
const skippedTestCalls = new Set(["xdescribe", "xit", "xtest"]);
const coverageIgnorePattern = /\b(?:c8|istanbul|v8)\s+ignore\b/i;
const findings = [];
const blocked = [];

function displayPath(filePath) {
  return relative(projectRoot, filePath).split(sep).join("/");
}

function normalizeRelativePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function addFinding(message) {
  findings.push(message);
}

function compareNames(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function discoverCodeFiles(directory) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  entries.sort((left, right) => compareNames(left.name, right.name));
  const files = [];

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await discoverCodeFiles(entryPath)));
    } else if (
      entry.isFile() &&
      sourceExtensions.has(extname(entry.name).toLowerCase())
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

function resolveProjectPath(relativePath) {
  const absolutePath = resolve(projectRoot, relativePath);
  const projectRelativePath = relative(projectRoot, absolutePath);

  if (
    isAbsolute(projectRelativePath) ||
    projectRelativePath === ".." ||
    projectRelativePath.startsWith(`..${sep}`) ||
    projectRelativePath.startsWith(sep)
  ) {
    throw new Error(`Path escapes the project root: ${relativePath}`);
  }

  return absolutePath;
}

async function readBaseline(relativePath) {
  try {
    return await readFile(resolveProjectPath(relativePath), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      blocked.push(relativePath);
      return undefined;
    }

    throw error;
  }
}

function getActiveBaselinePaths(policy) {
  const baselineFiles = policy.integrity?.baselineFiles;
  const paths = {
    protectedInputs: baselineFiles?.protectedInputs,
    harnessControls: baselineFiles?.harnessControls,
    acceptanceTests: baselineFiles?.acceptanceTestInventory,
  };

  if (
    Object.values(paths).some(
      (filePath) => typeof filePath !== "string" || filePath.length === 0,
    )
  ) {
    addFinding("Harness policy integrity.baselineFiles must define all three active baseline paths.");
    return undefined;
  }

  return paths;
}

async function getFileHash(relativePath, label) {
  try {
    return sha256(await readFile(resolveProjectPath(relativePath)));
  } catch (error) {
    if (error.code === "ENOENT") {
      addFinding(`Missing ${label} file: ${relativePath}`);
      return undefined;
    }

    throw error;
  }
}

function parseHashManifest(contents, manifestPath) {
  const entries = new Map();
  const lines = contents.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.trim() === "") {
      continue;
    }

    const match = /^([a-f\d]{64})\s{2}\*?(.+)$/i.exec(line);
    if (!match) {
      addFinding(
        `Invalid SHA-256 entry at ${manifestPath}:${index + 1}; expected "<64-hex-hash>  <path>".`,
      );
      continue;
    }

    const filePath = normalizeRelativePath(match[2]);
    if (entries.has(filePath)) {
      addFinding(`Duplicate path in ${manifestPath}: ${filePath}`);
      continue;
    }

    entries.set(filePath, match[1].toLowerCase());
  }

  return entries;
}

function compareHashManifest(manifestPath, baseline, current, expectedPaths) {
  const expected = new Set(expectedPaths);

  for (const filePath of expected) {
    const expectedHash = baseline.get(filePath);
    if (expectedHash === undefined) {
      addFinding(`Missing hash in ${manifestPath} for ${filePath}`);
      continue;
    }

    const currentHash = current.get(filePath);
    if (currentHash === undefined) {
      continue;
    }

    if (expectedHash !== currentHash) {
      addFinding(
        `Hash mismatch for ${filePath}: baseline ${expectedHash}, current ${currentHash}`,
      );
    }
  }

  for (const filePath of baseline.keys()) {
    if (!expected.has(filePath)) {
      addFinding(`Unexpected path in ${manifestPath}: ${filePath}`);
    }
  }
}

function parseScriptHash(packageContents) {
  let packageJson;

  try {
    packageJson = JSON.parse(packageContents);
  } catch (error) {
    addFinding(`Invalid package.json: ${error.message}`);
    return undefined;
  }

  if (
    packageJson.scripts === null ||
    typeof packageJson.scripts !== "object" ||
    Array.isArray(packageJson.scripts) ||
    Object.values(packageJson.scripts).some(
      (script) => typeof script !== "string",
    )
  ) {
    addFinding("package.json scripts must be an object.");
    return undefined;
  }

  const orderedScripts = Object.fromEntries(
    Object.keys(packageJson.scripts)
      .sort(compareNames)
      .map((name) => [name, packageJson.scripts[name]]),
  );
  return sha256(JSON.stringify(orderedScripts));
}

async function readCurrentHashes(paths) {
  const hashes = new Map();

  for (const filePath of paths) {
    const hash = await getFileHash(filePath, "protected");
    if (hash !== undefined) {
      hashes.set(filePath, hash);
    }
  }

  return hashes;
}

async function checkProtectedInputs(policy, baselineContents, manifestPath) {
  const protectedInputs = policy.integrity?.protectedInputs;
  if (!protectedInputs) {
    addFinding("Harness policy is missing integrity.protectedInputs.");
    return;
  }

  const packageManifest = protectedInputs.packageManifest;
  const dependencyLock = protectedInputs.dependencyLock;
  const expectedPaths = [
    protectedInputs.specification,
    protectedInputs.openapiContract,
    `${packageManifest}#scripts`,
    dependencyLock,
  ];

  if (
    expectedPaths.some(
      (filePath) => typeof filePath !== "string" || filePath.length === 0,
    )
  ) {
    addFinding("Harness policy has an invalid protected-input path.");
    return;
  }

  const current = await readCurrentHashes(
    expectedPaths.filter((filePath) => !filePath.endsWith("#scripts")),
  );

  try {
    const packageContents = await readFile(
      resolveProjectPath(packageManifest),
      "utf8",
    );
    const scriptsHash = parseScriptHash(packageContents);
    if (scriptsHash !== undefined) {
      current.set(`${packageManifest}#scripts`, scriptsHash);
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      addFinding(`Missing package manifest file: ${packageManifest}`);
    } else {
      throw error;
    }
  }

  const baseline = parseHashManifest(
    baselineContents,
    manifestPath,
  );
  compareHashManifest(
    manifestPath,
    baseline,
    current,
    expectedPaths,
  );
}

async function checkHarnessControls(policy, baselineContents, manifestPath) {
  const controls = policy.integrity?.protectedInputs?.harnessControls;
  if (!Array.isArray(controls)) {
    addFinding("Harness policy is missing integrity.protectedInputs.harnessControls.");
    return;
  }
  if (
    controls.some(
      (control) => typeof control !== "string" || control.length === 0,
    )
  ) {
    addFinding("Harness policy contains an invalid harness control path.");
    return;
  }

  const expectedPaths = [...new Set([policyPath, ...controls])].sort(compareNames);
  const current = await readCurrentHashes(expectedPaths);
  const baseline = parseHashManifest(baselineContents, manifestPath);
  compareHashManifest(manifestPath, baseline, current, expectedPaths);
}

function parseTestInventory(contents) {
  let inventory;

  try {
    inventory = JSON.parse(contents);
  } catch (error) {
    addFinding(
      `Invalid acceptance-test inventory JSON: ${error.message}`,
    );
    return undefined;
  }

  if (
    inventory === null ||
    typeof inventory !== "object" ||
    !Array.isArray(inventory.tests) ||
    inventory.tests.length === 0
  ) {
    addFinding(
      'Acceptance-test inventory must contain a non-empty "tests" array.',
    );
    return undefined;
  }

  const entries = new Map();

  for (const [index, test] of inventory.tests.entries()) {
    if (
      test === null ||
      typeof test !== "object" ||
      typeof test.path !== "string" ||
      !/^[a-f\d]{64}$/i.test(test.sha256 ?? "")
    ) {
      addFinding(
        `Invalid acceptance-test inventory entry at tests[${index}]; expected path and SHA-256 hash.`,
      );
      continue;
    }

    const filePath = normalizeRelativePath(test.path);
    if (
      !filePath.startsWith("tests/") ||
      filePath.split("/").includes("..") ||
      !sourceExtensions.has(extname(filePath).toLowerCase())
    ) {
      addFinding(
        `Invalid acceptance-test inventory path at tests[${index}]: ${test.path}`,
      );
      continue;
    }

    if (entries.has(filePath)) {
      addFinding(`Duplicate acceptance-test inventory path: ${filePath}`);
      continue;
    }

    entries.set(filePath, test.sha256.toLowerCase());
  }

  return entries;
}

async function checkAcceptanceTests(inventoryContents) {
  const inventory = parseTestInventory(inventoryContents);
  if (inventory === undefined) {
    return;
  }

  const testFiles = await discoverCodeFiles(resolveProjectPath("tests"));
  const actualPaths = new Set(testFiles.map(displayPath));

  for (const [filePath, expectedHash] of inventory) {
    if (!actualPaths.has(filePath)) {
      addFinding(`Missing acceptance-test file: ${filePath}`);
      continue;
    }

    const actualHash = await getFileHash(filePath, "acceptance-test");
    if (actualHash !== undefined && expectedHash !== actualHash) {
      addFinding(
        `Acceptance-test hash mismatch for ${filePath}: baseline ${expectedHash}, current ${actualHash}`,
      );
    }
  }

  for (const filePath of actualPaths) {
    if (!inventory.has(filePath)) {
      addFinding(`Unexpected acceptance-test file: ${filePath}`);
    }
  }
}

function getScriptKind(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function getAccessChain(expression) {
  const properties = [];

  while (ts.isPropertyAccessExpression(expression)) {
    properties.unshift(expression.name.text);
    expression = expression.expression;
  }

  return {
    root: ts.isIdentifier(expression) ? expression.text : undefined,
    properties,
  };
}

function hasEnabledSkipOption(call) {
  return call.arguments.some(
    (argument) =>
      ts.isObjectLiteralExpression(argument) &&
      argument.properties.some((property) => {
        const propertyName =
          ts.isPropertyAssignment(property) &&
          (ts.isIdentifier(property.name) ||
            ts.isStringLiteralLike(property.name))
            ? property.name.text
            : undefined;

        if (
          !ts.isPropertyAssignment(property) ||
          propertyName !== "skip"
        ) {
          return false;
        }

        return !(
          property.initializer.kind === ts.SyntaxKind.FalseKeyword ||
          property.initializer.kind === ts.SyntaxKind.NullKeyword
        );
      }),
  );
}

function findTestMarkers(sourceFile, filePath) {
  const importedTestRoots = new Set(testRoots);

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "node:test" ||
      statement.importClause?.namedBindings === undefined
    ) {
      continue;
    }

    const bindings = statement.importClause.namedBindings;
    if (ts.isNamespaceImport(bindings)) {
      importedTestRoots.add(bindings.name.text);
    } else {
      for (const element of bindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        if (testRoots.has(importedName)) {
          importedTestRoots.add(element.name.text);
        }
      }
    }
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const { root, properties } = getAccessChain(node.expression);
      let marker;

      if (skippedTestCalls.has(root)) {
        marker = `${root}()`;
      } else if (
        importedTestRoots.has(root) &&
        properties.some((property) => property === "skip" || property === "todo")
      ) {
        marker = `${root}.${properties.find((property) => property === "skip" || property === "todo")}()`;
      } else if (importedTestRoots.has(root) && hasEnabledSkipOption(node)) {
        marker = `${root}(..., { skip: ... })`;
      }

      if (marker) {
        const position = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        addFinding(
          `Unexpected skipped/todo test in ${filePath}:${position.line + 1}:${position.character + 1}: ${marker}`,
        );
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function findCoverageIgnoreDirectives(sourceFile, sourceText, filePath) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    getScriptKind(filePath) === ts.ScriptKind.TSX ||
      getScriptKind(filePath) === ts.ScriptKind.JSX
      ? ts.LanguageVariant.JSX
      : ts.LanguageVariant.Standard,
    sourceText,
  );

  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      (token === ts.SyntaxKind.SingleLineCommentTrivia ||
        token === ts.SyntaxKind.MultiLineCommentTrivia) &&
      coverageIgnorePattern.test(scanner.getTokenText())
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(
        scanner.getTokenPos(),
      );
      addFinding(
        `Coverage-ignore directive in ${filePath}:${position.line + 1}:${position.character + 1}`,
      );
    }

    token = scanner.scan();
  }
}

async function checkTestAndCoverageMarkers() {
  const [testFiles, sourceFiles] = await Promise.all([
    discoverCodeFiles(resolveProjectPath("tests")),
    discoverCodeFiles(resolveProjectPath("src")),
  ]);
  const files = [...new Set([...testFiles, ...sourceFiles])].sort(compareNames);

  for (const filePath of files) {
    const sourceText = await readFile(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(filePath),
    );

    if (testFiles.includes(filePath)) {
      findTestMarkers(sourceFile, displayPath(filePath));
    }
    findCoverageIgnoreDirectives(
      sourceFile,
      sourceText,
      displayPath(filePath),
    );
  }
}

async function run() {
  let policyContents;
  let policy;

  try {
    policyContents = await readFile(resolveProjectPath(policyPath), "utf8");
    policy = JSON.parse(policyContents);
  } catch (error) {
    addFinding(`Cannot read valid ${policyPath}: ${error.message}`);
  }

  if (policy !== undefined) {
    const activeBaselinePaths = getActiveBaselinePaths(policy);
    if (activeBaselinePaths !== undefined) {
      const [protectedContents, harnessContents, inventoryContents] =
        await Promise.all([
          readBaseline(activeBaselinePaths.protectedInputs),
          readBaseline(activeBaselinePaths.harnessControls),
          readBaseline(activeBaselinePaths.acceptanceTests),
        ]);

      if (protectedContents !== undefined) {
        await checkProtectedInputs(
          policy,
          protectedContents,
          activeBaselinePaths.protectedInputs,
        );
      }
      if (harnessContents !== undefined) {
        await checkHarnessControls(
          policy,
          harnessContents,
          activeBaselinePaths.harnessControls,
        );
      }
      if (inventoryContents !== undefined) {
        await checkAcceptanceTests(inventoryContents);
      }
    }

    await checkTestAndCoverageMarkers();
  }

  for (const finding of findings) {
    console.error(`FAIL: ${finding}`);
  }

  if (blocked.length > 0) {
    console.error(
      `BLOCKED: pre-baseline state; missing approved baseline files: ${blocked.join(", ")}. Run T019 after acceptance-test review. Integrity verification cannot report PASS.`,
    );
    process.exitCode = findings.length > 0 ? 1 : 2;
  } else if (findings.length > 0) {
    console.error(`FAIL: integrity verification found ${findings.length} issue(s).`);
    process.exitCode = 1;
  } else {
    console.log("PASS: approved integrity baselines and repository checks match.");
  }
}

try {
  await run();
} catch (error) {
  console.error(`FAIL: integrity verification could not complete: ${error.message}`);
  process.exitCode = 1;
}
