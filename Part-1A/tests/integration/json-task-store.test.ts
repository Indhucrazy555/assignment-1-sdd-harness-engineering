import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";

const sampleTask = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Prepare report",
  description: "Review the draft",
  priority: "medium",
  status: "pending",
  tags: ["work"],
  createdAt: "2026-11-19T13:00:00.000Z",
  dueDate: "2026-11-25",
};

async function withTemporaryStore(run) {
  const directory = await mkdtemp(resolve(tmpdir(), "smart-todo-store-"));
  const filePath = resolve(directory, "nested", "data", "tasks.json");
  try {
    const { JsonTaskStore } = await import(
      "../../src/persistence/json-task-store.ts"
    );
    await run(new JsonTaskStore(filePath), filePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("a missing store loads as an empty collection without creating task data", async () => {
  await withTemporaryStore(async (store, filePath) => {
    assert.deepEqual(await store.load(), []);
    await assert.rejects(access(filePath), (error) => error.code === "ENOENT");
  });
});

test("saving and loading a JSON task collection preserves every task field", async () => {
  await withTemporaryStore(async (store, filePath) => {
    await store.save([sampleTask]);

    const storedDocument = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(storedDocument, { tasks: [sampleTask] });
    assert.deepEqual(await store.load(), [sampleTask]);
  });
});

test("a new service and store instance restore saved tasks after restart", async () => {
  await withTemporaryStore(async (store, filePath) => {
    const { TaskService } = await import("../../src/services/task-service.ts");
    const service = new TaskService(store);
    const created = await service.create({
      title: "Persist this task",
      description: "Restore every field",
      priority: "high",
      status: "completed",
      tags: ["work", "review"],
      dueDate: "2026-11-25",
    });

    const { JsonTaskStore: RestartedStore } = await import(
      "../../src/persistence/json-task-store.ts"
    );
    const restartedService = new TaskService(new RestartedStore(filePath));
    assert.deepEqual(await restartedService.getById(created.id), created);
  });
});

test("malformed and invalid collections fail without changing their stored bytes", async () => {
  await withTemporaryStore(async (store, filePath) => {
    await mkdir(dirname(filePath), { recursive: true });
    const invalidDocuments = [
      "{",
      JSON.stringify({ tasks: "not-an-array" }),
      JSON.stringify({ tasks: [{ ...sampleTask, priority: "urgent" }] }),
      JSON.stringify({ tasks: [sampleTask, sampleTask] }),
    ];

    for (const document of invalidDocuments) {
      await writeFile(filePath, document);
      await assert.rejects(store.load());
      assert.equal(await readFile(filePath, "utf8"), document);
    }

    const { TaskService } = await import("../../src/services/task-service.ts");
    const malformedDocument = "{";
    await writeFile(filePath, malformedDocument);
    const service = new TaskService(store);
    await assert.rejects(
      service.create({
        title: "Must not replace malformed data",
        description: "",
        priority: "low",
      }),
    );
    assert.equal(await readFile(filePath, "utf8"), malformedDocument);
  });
});

test("read and write failures are surfaced and do not alter the blocking file", async () => {
  await withTemporaryStore(async (_store, filePath) => {
    const directory = dirname(dirname(filePath));
    const blockerPath = resolve(directory, "not-a-directory");
    const blockerContents = "preserve this file";
    await mkdir(directory, { recursive: true });
    await writeFile(blockerPath, blockerContents);

    const { JsonTaskStore } = await import(
      "../../src/persistence/json-task-store.ts"
    );
    const failingStore = new JsonTaskStore(
      resolve(blockerPath, "tasks.json"),
    );
    await assert.rejects(failingStore.load());
    await assert.rejects(failingStore.save([sampleTask]));
    assert.equal(await readFile(blockerPath, "utf8"), blockerContents);
  });
});

test("a failed save leaves the previous valid task collection unchanged", async () => {
  await withTemporaryStore(async (store, filePath) => {
    await store.save([sampleTask]);
    const originalContents = await readFile(filePath, "utf8");
    const { JsonTaskStore } = await import(
      "../../src/persistence/json-task-store.ts"
    );
    const failingStore = new JsonTaskStore(filePath);
    failingStore.save = async () => {
      throw new Error("Injected storage write failure");
    };
    const { TaskService } = await import("../../src/services/task-service.ts");
    const service = new TaskService(failingStore);

    await assert.rejects(
      service.patch(sampleTask.id, { title: "Must not be persisted" }),
    );
    assert.equal(await readFile(filePath, "utf8"), originalContents);
    assert.deepEqual(await store.load(), [sampleTask]);
  });
});

test("overlapping creates preserve receipt order and do not lose successful mutations", async () => {
  await withTemporaryStore(async (store, filePath) => {
    const { TaskService } = await import("../../src/services/task-service.ts");
    const load = store.load.bind(store);
    const save = store.save.bind(store);
    let firstSavePending = false;
    let loadsDuringFirstSave = 0;
    let firstSaveStarted;
    const firstSaveStartedPromise = new Promise((resolveStarted) => {
      firstSaveStarted = resolveStarted;
    });
    let releaseFirstSave;
    const firstSaveGate = new Promise((resolveSave) => {
      releaseFirstSave = resolveSave;
    });
    let blockFirstSave = true;

    store.load = async () => {
      if (firstSavePending) {
        loadsDuringFirstSave += 1;
      }
      return load();
    };
    store.save = async (tasks) => {
      if (blockFirstSave) {
        blockFirstSave = false;
        firstSavePending = true;
        firstSaveStarted();
        await firstSaveGate;
        firstSavePending = false;
      }
      return save(tasks);
    };
    const service = new TaskService(store);

    const firstMutation = service.create({
      title: "First mutation",
      description: "",
      priority: "high",
    });
    const firstSaveReached = await Promise.race([
      firstSaveStartedPromise.then(() => true),
      firstMutation.then(
        () => false,
        () => false,
      ),
    ]);
    assert.equal(firstSaveReached, true);

    const secondMutation = service.create({
      title: "Second mutation",
      description: "",
      priority: "low",
    });
    const outcomesPromise = Promise.allSettled([
      firstMutation,
      secondMutation,
    ]);
    await new Promise((resolveTurn) => setImmediate(resolveTurn));
    const concurrentLoads = loadsDuringFirstSave;
    releaseFirstSave();
    const outcomes = await outcomesPromise;

    assert.equal(concurrentLoads, 0);
    assert.deepEqual(
      outcomes.map((outcome) => outcome.status),
      ["fulfilled", "fulfilled"],
    );
    const createdTasks = outcomes.map((outcome) => outcome.value);
    assert.deepEqual(await store.load(), createdTasks);
    const { JsonTaskStore: RestartedStore } = await import(
      "../../src/persistence/json-task-store.ts"
    );
    assert.deepEqual(await new RestartedStore(filePath).load(), createdTasks);
  });
});

test("a failed queued mutation does not prevent a later mutation from succeeding", async () => {
  await withTemporaryStore(async (store) => {
    const { TaskService } = await import("../../src/services/task-service.ts");
    const save = store.save.bind(store);
    let failFirstSave = true;
    store.save = async (tasks) => {
      if (failFirstSave) {
        failFirstSave = false;
        throw new Error("Injected first-write failure");
      }
      return save(tasks);
    };
    const service = new TaskService(store);

    const outcomes = await Promise.allSettled([
      service.create({
        title: "Rejected mutation",
        description: "",
        priority: "high",
      }),
      service.create({
        title: "Recovered mutation",
        description: "",
        priority: "low",
      }),
    ]);

    assert.equal(outcomes[0].status, "rejected");
    assert.equal(outcomes[1].status, "fulfilled");
    assert.deepEqual(await store.load(), [outcomes[1].value]);
  });
});
