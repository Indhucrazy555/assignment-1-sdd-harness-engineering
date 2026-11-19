import { randomUUID } from "node:crypto";
import type {
  CreateTaskInput,
  Task,
  TaskListQuery,
  TaskPriority,
  TaskRepository,
  UpdateTaskInput,
} from "../domain/task.ts";

const priorityOrder: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export class TaskNotFoundError extends Error {
  readonly code = "TASK_NOT_FOUND";

  constructor() {
    super("Task not found.");
    this.name = "TaskNotFoundError";
  }
}

export class TaskService {
  private readonly store: TaskRepository;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(store: TaskRepository) {
    this.store = store;
  }

  create(input: CreateTaskInput): Promise<Task> {
    return this.enqueueMutation(async () => {
      const tasks = await this.store.load();
      const task: Task = {
        id: randomUUID(),
        title: input.title.trim(),
        description: input.description,
        priority: input.priority,
        status: input.status ?? "pending",
        tags: (input.tags ?? []).map((tag) => tag.trim()),
        createdAt: new Date().toISOString(),
        dueDate: input.dueDate ?? null,
      };

      await this.store.save([...tasks, task]);
      return copyTask(task);
    });
  }

  async getById(id: string): Promise<Task> {
    const tasks = await this.store.load();
    const task = tasks.find((candidate) => candidate.id === id);
    if (!task) {
      throw new TaskNotFoundError();
    }
    return copyTask(task);
  }

  async list(query: TaskListQuery = {}): Promise<Task[]> {
    const tasks = (await this.store.load()).map(copyTask);
    const requestedTags = (query.tags ?? []).map((tag) => tag.toLowerCase());
    const matchingTasks = tasks.filter(
      (task) =>
        (query.status === undefined || task.status === query.status) &&
        (query.priority === undefined || task.priority === query.priority) &&
        requestedTags.every((requestedTag) =>
          task.tags.some((tag) => tag.toLowerCase() === requestedTag),
        ),
    );

    matchingTasks.sort((left, right) => {
      if (query.sort === "priority") {
        const priorityDifference =
          priorityOrder[left.priority] - priorityOrder[right.priority];
        if (priorityDifference !== 0) {
          return priorityDifference;
        }
      }
      return compareDefaultOrder(left, right);
    });
    return matchingTasks;
  }

  patch(id: string, input: UpdateTaskInput): Promise<Task> {
    return this.enqueueMutation(async () => {
      const tasks = await this.store.load();
      const index = tasks.findIndex((candidate) => candidate.id === id);
      if (index < 0) {
        throw new TaskNotFoundError();
      }

      const current = tasks[index];
      const updated: Task = {
        ...current,
        ...input,
        id: current.id,
        createdAt: current.createdAt,
        title: input.title === undefined ? current.title : input.title.trim(),
        tags:
          input.tags === undefined
            ? [...current.tags]
            : input.tags.map((tag) => tag.trim()),
      };
      const nextTasks = [...tasks];
      nextTasks[index] = updated;
      await this.store.save(nextTasks);
      return copyTask(updated);
    });
  }

  delete(id: string): Promise<void> {
    return this.enqueueMutation(async () => {
      const tasks = await this.store.load();
      const index = tasks.findIndex((candidate) => candidate.id === id);
      if (index < 0) {
        throw new TaskNotFoundError();
      }

      const nextTasks = [...tasks];
      nextTasks.splice(index, 1);
      await this.store.save(nextTasks);
    });
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function copyTask(task: Task): Task {
  return { ...task, tags: [...task.tags] };
}

function compareDefaultOrder(left: Task, right: Task): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? -1 : 1;
  }
  if (left.id !== right.id) {
    return left.id < right.id ? -1 : 1;
  }
  return 0;
}
