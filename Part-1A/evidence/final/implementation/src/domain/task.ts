export type TaskPriority = "low" | "medium" | "high";

export type TaskStatus = "pending" | "in_progress" | "completed";

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  tags: string[];
  createdAt: string;
  dueDate: string | null;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  status?: TaskStatus;
  tags?: string[];
  dueDate?: string | null;
}

export type UpdateTaskInput = Partial<
  Pick<Task, "title" | "description" | "priority" | "status" | "tags" | "dueDate">
>;

export interface TaskListQuery {
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  sort?: "priority";
}

export interface TaskListResponse {
  tasks: Task[];
  count: number;
}

export interface TaskRepository {
  load(): Promise<Task[]>;
  save(tasks: readonly Task[]): Promise<void>;
}
