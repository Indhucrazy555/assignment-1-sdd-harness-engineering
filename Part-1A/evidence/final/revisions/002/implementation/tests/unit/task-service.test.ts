import assert from "node:assert/strict";
import test from "node:test";

const unknownId = "00000000-0000-4000-8000-000000000001";

function createMemoryStore(initialTasks = []) {
  let tasks = structuredClone(initialTasks);
  return {
    async load() {
      return structuredClone(tasks);
    },
    async save(nextTasks) {
      tasks = structuredClone(nextTasks);
    },
  };
}

async function createService(initialTasks = []) {
  const { TaskService } = await import("../../src/services/task-service.ts");
  return new TaskService(createMemoryStore(initialTasks));
}

function makeTask(id, { status, priority, tags, createdAt }) {
  return {
    id,
    title: `Task ${id}`,
    description: "",
    priority,
    status,
    tags,
    createdAt,
    dueDate: null,
  };
}

function assertUnknownTask(operation) {
  return assert.rejects(
    operation,
    (error) => error?.code === "TASK_NOT_FOUND",
  );
}

test("create generates immutable identifiers and creation time with documented defaults", async () => {
  const service = await createService();
  const task = await service.create({
    title: "  Prepare report  ",
    description: "Review the draft",
    priority: "high",
  });
  const secondTask = await service.create({
    title: "Review report",
    description: "",
    priority: "low",
  });

  assert.match(
    task.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.notEqual(task.id, secondTask.id);
  assert.match(task.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(new Date(task.createdAt).toISOString(), task.createdAt);
  assert.deepEqual(
    {
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      tags: task.tags,
      dueDate: task.dueDate,
    },
    {
      title: "Prepare report",
      description: "Review the draft",
      priority: "high",
      status: "pending",
      tags: [],
      dueDate: null,
    },
  );
});

test("retrieve returns the complete task created by the service", async () => {
  const service = await createService();
  const created = await service.create({
    title: "Prepare report",
    description: "",
    priority: "medium",
    status: "in_progress",
    tags: ["work"],
    dueDate: "2026-11-25",
  });

  assert.deepEqual(await service.getById(created.id), created);
});

test("patch changes supplied fields and preserves omitted fields", async () => {
  const service = await createService();
  const created = await service.create({
    title: "Prepare report",
    description: "Review the draft",
    priority: "medium",
    status: "pending",
    tags: ["work"],
    dueDate: "2026-11-25",
  });

  const updated = await service.patch(created.id, {
    title: "Updated report",
    dueDate: null,
  });

  assert.deepEqual(updated, {
    ...created,
    title: "Updated report",
    dueDate: null,
  });
});

test("delete removes the task and later retrieval reports it as unknown", async () => {
  const service = await createService();
  const created = await service.create({
    title: "Prepare report",
    description: "",
    priority: "low",
  });

  await service.delete(created.id);
  await assertUnknownTask(service.getById(created.id));
});

test("unknown IDs are not treated as existing tasks", async () => {
  const service = await createService();

  await assertUnknownTask(service.getById(unknownId));
  await assertUnknownTask(service.patch(unknownId, { title: "Updated" }));
  await assertUnknownTask(service.delete(unknownId));
});

test("every allowed status can transition to every other allowed status", async () => {
  const statuses = ["pending", "in_progress", "completed"];
  for (const currentStatus of statuses) {
    for (const nextStatus of statuses) {
      const task = makeTask(unknownId, {
        status: currentStatus,
        priority: "medium",
        tags: [],
        createdAt: "2026-11-19T13:00:00.000Z",
      });
      const service = await createService([task]);

      const updated = await service.patch(task.id, { status: nextStatus });
      assert.equal(updated.status, nextStatus);
    }
  }
});

test("list filters combine with AND and require every tag case-insensitively", async () => {
  const tasks = [
    makeTask("00000000-0000-4000-8000-000000000001", {
      status: "pending",
      priority: "high",
      tags: ["Work", "School"],
      createdAt: "2026-11-19T13:00:00.000Z",
    }),
    makeTask("00000000-0000-4000-8000-000000000002", {
      status: "pending",
      priority: "high",
      tags: ["Work"],
      createdAt: "2026-11-19T13:01:00.000Z",
    }),
    makeTask("00000000-0000-4000-8000-000000000003", {
      status: "completed",
      priority: "high",
      tags: ["Work", "School"],
      createdAt: "2026-11-19T13:02:00.000Z",
    }),
  ];
  const service = await createService(tasks);

  const matching = await service.list({
    status: "pending",
    priority: "high",
    tags: ["work", "school"],
  });
  assert.deepEqual(
    matching.map((task) => task.id),
    ["00000000-0000-4000-8000-000000000001"],
  );
  assert.deepEqual(
    (await service.list({ tags: ["WORK", "school"] })).map((task) => task.id),
    [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000003",
    ],
  );
});

test("list returns an empty collection when filters match no tasks", async () => {
  const service = await createService([
    makeTask(unknownId, {
      status: "pending",
      priority: "low",
      tags: [],
      createdAt: "2026-11-19T13:00:00.000Z",
    }),
  ]);

  assert.deepEqual(
    await service.list({ status: "completed", priority: "high" }),
    [],
  );
});

test("list uses creation-time and ID tie-breakers for default and priority order", async () => {
  const tasks = [
    makeTask("00000000-0000-4000-8000-000000000001", {
      status: "pending",
      priority: "high",
      tags: [],
      createdAt: "2026-11-19T13:02:00.000Z",
    }),
    makeTask("00000000-0000-4000-8000-000000000003", {
      status: "pending",
      priority: "high",
      tags: [],
      createdAt: "2026-11-19T13:02:00.000Z",
    }),
    makeTask("00000000-0000-4000-8000-000000000005", {
      status: "pending",
      priority: "high",
      tags: [],
      createdAt: "2026-11-19T13:01:00.000Z",
    }),
    makeTask("00000000-0000-4000-8000-000000000004", {
      status: "pending",
      priority: "medium",
      tags: [],
      createdAt: "2026-11-19T13:00:00.000Z",
    }),
    makeTask("00000000-0000-4000-8000-000000000002", {
      status: "pending",
      priority: "low",
      tags: [],
      createdAt: "2026-11-19T13:00:00.000Z",
    }),
  ];
  const service = await createService(tasks);

  assert.deepEqual(
    (await service.list()).map((task) => task.id),
    [
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000004",
      "00000000-0000-4000-8000-000000000005",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000003",
    ],
  );
  assert.deepEqual(
    (await service.list({ sort: "priority" })).map((task) => task.id),
    [
      "00000000-0000-4000-8000-000000000005",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000004",
      "00000000-0000-4000-8000-000000000002",
    ],
  );
});
