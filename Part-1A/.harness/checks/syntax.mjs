import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = resolve(projectRoot, "src");
const typeScriptExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);

function compareNames(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function discoverTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  entries.sort((left, right) => compareNames(left.name, right.name));

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await discoverTypeScriptFiles(entryPath)));
    } else if (
      entry.isFile() &&
      typeScriptExtensions.has(extname(entry.name).toLowerCase())
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

function formatPath(filePath) {
  return relative(projectRoot, filePath).split(sep).join("/");
}

async function checkSyntax() {
  let files;

  try {
    files = await discoverTypeScriptFiles(sourceRoot);
  } catch (error) {
    if (error.code === "ENOENT" && error.path === sourceRoot) {
      console.log("No src directory found; no TypeScript files to parse.");
      return;
    }

    throw error;
  }

  if (files.length === 0) {
    console.log("No TypeScript files found under src; nothing to parse.");
    return;
  }

  let syntaxErrorCount = 0;

  for (const filePath of files) {
    const sourceText = await readFile(filePath, "utf8");
    const scriptKind =
      extname(filePath).toLowerCase() === ".tsx"
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );

    for (const diagnostic of sourceFile.parseDiagnostics) {
      const position = sourceFile.getLineAndCharacterOfPosition(
        diagnostic.start ?? 0,
      );
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        "\n",
      );
      const code = diagnostic.code.toString().padStart(4, "0");

      console.error(
        `${formatPath(filePath)}:${position.line + 1}:${position.character + 1}: TS${code}: ${message}`,
      );
      syntaxErrorCount += 1;
    }
  }

  if (syntaxErrorCount > 0) {
    console.error(
      `Found ${syntaxErrorCount} syntax error(s) in ${files.length} TypeScript file(s).`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Syntax check passed: parsed ${files.length} TypeScript file(s).`);
}

try {
  await checkSyntax();
} catch (error) {
  console.error(`Syntax check could not complete: ${error.message}`);
  process.exitCode = 1;
}
