import { randomUUID } from "node:crypto";
import {
  mkdir,
  lstat,
  open,
  readFile,
  rename,
  stat,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { Task, TaskRepository } from "../domain/task.ts";
import {
  isCanonicalTaskId,
  isValidCreatedAt,
  isValidDueDate,
} from "../validation/task-validation.ts";

const taskFields = new Set([
  "id",
  "title",
  "description",
  "priority",
  "status",
  "tags",
  "createdAt",
  "dueDate",
]);
const priorities = new Set<string>(["low", "medium", "high"]);
const statuses = new Set<string>(["pending", "in_progress", "completed"]);

export class TaskStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TaskStoreError";
  }
}

export class JsonTaskStore implements TaskRepository {
  readonly filePath: string;

  constructor(filePath = resolve(process.cwd(), "data", "tasks.json")) {
    this.filePath = filePath;
  }

  async load(): Promise<Task[]> {
    let contents: string;
    try {
      contents = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (
        isNodeError(error) &&
        error.code === "ENOENT" &&
        (await isMissingTaskFile(this.filePath))
      ) {
        return [];
      }
      throw new TaskStoreError("Unable to read task storage.", { cause: error });
    }

    let document: unknown;
    try {
      document = JSON.parse(contents);
    } catch (error) {
      throw new TaskStoreError("Task storage contains invalid JSON.", {
        cause: error,
      });
    }

    if (!isRecord(document) || Object.keys(document).length !== 1) {
      throw new TaskStoreError("Task storage has an invalid collection shape.");
    }

    const rawTasks = document.tasks;
    if (!Array.isArray(rawTasks)) {
      throw new TaskStoreError("Task storage has an invalid collection shape.");
    }

    const rawTaskList: unknown[] = rawTasks;
    const tasks: Task[] = [];
    const ids = new Set<string>();
    for (const rawTask of rawTaskList) {
      const task = validateStoredTask(rawTask);
      if (ids.has(task.id)) {
        throw new TaskStoreError("Task storage contains duplicate task IDs.");
      }
      ids.add(task.id);
      tasks.push(task);
    }
    return tasks;
  }

  async save(tasks: readonly Task[]): Promise<void> {
    const snapshot = tasks.map(copyTask);
    validateTaskCollection(snapshot);

    const directory = dirname(this.filePath);
    const temporaryPath = join(
      directory,
      `.${basename(this.filePath)}.${randomUUID()}.tmp`,
    );
    let file: FileHandle | undefined;
    try {
      await mkdir(directory, { recursive: true });
      file = await open(temporaryPath, "wx");
      await file.writeFile(`${JSON.stringify({ tasks: snapshot }, null, 2)}\n`, {
        encoding: "utf8",
      });
      await file.sync();
      await file.close();
      file = undefined;
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      if (file) {
        try {
          await file.close();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      try {
        await unlink(temporaryPath);
      } catch (cleanupError) {
        if (!isNodeError(cleanupError) || cleanupError.code !== "ENOENT") {
          cleanupErrors.push(cleanupError);
        }
      }
      const cause =
        cleanupErrors.length === 0
          ? error
          : new AggregateError([error, ...cleanupErrors]);
      throw new TaskStoreError("Unable to write task storage.", { cause });
    }
  }
}

function validateTaskCollection(tasks: readonly Task[]): void {
  const ids = new Set<string>();
  for (const task of tasks) {
    const validated = validateStoredTask(task);
    if (ids.has(validated.id)) {
      throw new TaskStoreError("Task storage contains duplicate task IDs.");
    }
    ids.add(validated.id);
  }
}

function validateStoredTask(value: unknown): Task {
  if (!isRecord(value)) {
    throw new TaskStoreError("Task storage contains an invalid task.");
  }
  const keys = Object.keys(value);
  if (
    keys.length !== taskFields.size ||
    keys.some((key) => !taskFields.has(key))
  ) {
    throw new TaskStoreError("Task storage contains an invalid task.");
  }

  const tags = value.tags;
  if (
    !isCanonicalTaskId(value.id) ||
    typeof value.title !== "string" ||
    value.title !== value.title.trim() ||
    codePointLength(value.title) < 1 ||
    codePointLength(value.title) > 100 ||
    typeof value.description !== "string" ||
    codePointLength(value.description) > 2000 ||
    !isPriority(value.priority) ||
    !isStatus(value.status) ||
    !Array.isArray(tags) ||
    tags.length > 10 ||
    typeof value.createdAt !== "string" ||
    !isValidCreatedAt(value.createdAt) ||
    (value.dueDate !== null &&
      (typeof value.dueDate !== "string" ||
        !isValidDueDate(value.dueDate)))
  ) {
    throw new TaskStoreError("Task storage contains an invalid task.");
  }

  const seenTags = new Set<string>();
  const validatedTags: string[] = [];
  const rawTags: unknown[] = tags;
  for (const tag of rawTags) {
    if (
      typeof tag !== "string" ||
      tag !== tag.trim() ||
      codePointLength(tag) < 1 ||
      codePointLength(tag) > 30 ||
      seenTags.has(tag.toLowerCase())
    ) {
      throw new TaskStoreError("Task storage contains an invalid task.");
    }
    seenTags.add(tag.toLowerCase());
    validatedTags.push(tag);
  }

  return {
    id: value.id,
    title: value.title,
    description: value.description,
    priority: value.priority,
    status: value.status,
    tags: validatedTags,
    createdAt: value.createdAt,
    dueDate: value.dueDate,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isPriority(value: unknown): value is Task["priority"] {
  return typeof value === "string" && priorities.has(value);
}

function isStatus(value: unknown): value is Task["status"] {
  return typeof value === "string" && statuses.has(value);
}

function copyTask(task: Task): Task {
  return { ...task, tags: [...task.tags] };
}

async function isMissingTaskFile(filePath: string): Promise<boolean> {
  try {
    const parent = await stat(dirname(filePath));
    if (!parent.isDirectory()) {
      return false;
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return true;
    }
    throw new TaskStoreError("Unable to access task storage.", {
      cause: error,
    });
  }

  try {
    await lstat(filePath);
    return false;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return true;
    }
    throw new TaskStoreError("Unable to access task storage.", {
      cause: error,
    });
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
