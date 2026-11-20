import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { InterpretationError, interpretReminder } from "./application/interpret.js";
import {
  ProviderError,
  type ProviderCallContext,
} from "./providers/provider.js";
import { MockProvider } from "./providers/mock-provider.js";

function caseContext(args: readonly string[]): ProviderCallContext | undefined {
  const index = args.indexOf("--case-id");
  if (index < 0) {
    return undefined;
  }
  const caseId = args[index + 1];
  if (!caseId) {
    throw new Error("The --case-id option requires an evaluation case ID.");
  }
  return { caseId };
}

async function readStdin(): Promise<string> {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString();
  }
  return input;
}

async function main(): Promise<void> {
  let context: ProviderCallContext | undefined;
  try {
    context = caseContext(process.argv.slice(2));
  } catch {
    process.stderr.write("Input failure: invalid command-line arguments.\n");
    process.exitCode = 2;
    return;
  }

  let request: unknown;
  try {
    request = JSON.parse(await readStdin());
  } catch {
    process.stderr.write("Input failure: standard input must contain valid JSON.\n");
    process.exitCode = 2;
    return;
  }

  try {
    const response = await interpretReminder(request, new MockProvider(), context);
    process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    if (error instanceof ProviderError) {
      process.stderr.write(`Provider failure: ${error.code}.\n`);
      process.exitCode = 3;
    } else if (error instanceof InterpretationError) {
      process.stderr.write(
        `${error.kind === "input" ? "Input" : "Application"} failure: ${error.code}.\n`,
      );
      process.exitCode = error.kind === "input" ? 2 : 1;
    } else {
      process.stderr.write("Application failure.\n");
      process.exitCode = 1;
    }
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void main();
}
