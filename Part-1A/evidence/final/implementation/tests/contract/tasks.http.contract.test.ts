import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";

const taskKeys = [
  "createdAt",
  "description",
  "dueDate",
  "id",
  "priority",
  "status",
  "tags",
  "title",
].sort();
const unknownId = "00000000-0000-4000-8000-000000000001";
const listTaskInputs = [
  {
    title: "Pending high",
    description: "",
    priority: "high",
    status: "pending",
    tags: ["Work", "School"],
  },
  {
    title: "Pending low",
    description: "",
    priority: "low",
    status: "pending",
    tags: ["Work"],
  },
  {
    title: "Completed medium",
    description: "",
    priority: "medium",
    status: "completed",
    tags: ["School"],
  },
];

async function withServer(run, { initialStore, production = false } = {}) {
  const directory = await mkdtemp(resolve(tmpdir(), "smart-todo-http-"));
  const storePath = resolve(directory, "data", "tasks.json");
  let server;
  try {
    if (initialStore !== undefined) {
      await mkdir(dirname(storePath), { recursive: true });
      await writeFile(storePath, initialStore);
    }

    if (production) {
      const { startServer } = await import("../../src/server.ts");
      server = await startServer({ storePath, port: 0 });
      if (!server.listening) {
        await once(server, "listening");
      }
    } else {
      const { createServer } = await import("../../src/server.ts");
      server = createServer({ storePath });
      await new Promise((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen(0, "127.0.0.1", resolveListen);
      });
    }

    const address = server.address();
    assert.ok(address && typeof address === "object");
    if (!production) {
      assert.equal(address.address, "127.0.0.1");
    }
    await run(`http://127.0.0.1:${address.port}`, address);
  } finally {
    if (server?.listening) {
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) {
            rejectClose(error);
          } else {
            resolveClose();
          }
        });
      });
    }
    await rm(directory, { recursive: true, force: true });
  }
}

async function assertErrorResponse(response, status, code, message) {
  assert.equal(response.status, status);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^application\/json(?:\s*;|$)/i,
  );
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ["error"]);
  assert.equal(body.error.code, code);
  assert.equal(body.error.message, message);
  const errorKeys = Object.keys(body.error).sort();
  const hasDetails = body.error.details !== undefined;
  assert.deepEqual(
    errorKeys,
    hasDetails
      ? ["code", "details", "message"]
      : ["code", "message"],
  );
  if (hasDetails) {
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(Array.isArray(body.error.details));
    assert.ok(body.error.details.length > 0);
    for (const detail of body.error.details) {
      assert.deepEqual(Object.keys(detail).sort(), ["field", "issue"]);
      assert.equal(typeof detail.field, "string");
      assert.equal(typeof detail.issue, "string");
    }
  }
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /\bat\s+\S+\s+\(/i);
  assert.doesNotMatch(serialized, /tasks\.json/i);
  assert.doesNotMatch(
    serialized,
    /(?:[A-Za-z]:[\\/][^\s"'<>]*|\\\\[^\\/\s]+[\\/][^\s"'<>]+)/,
  );
  assert.doesNotMatch(
    serialized,
    /(?:^|["\s])\/(?:[^/\s"'<>]+\/)*[^/\s"'<>]+/,
  );
  return body;
}

async function postTask(origin, task, contentType = "application/json") {
  return fetch(`${origin}/tasks`, {
    method: "POST",
    headers: { "content-type": contentType },
    body: JSON.stringify(task),
  });
}

async function seedListTasks(origin) {
  const tasks = [];
  for (const input of listTaskInputs) {
    const response = await postTask(origin, input);
    assert.equal(response.status, 201);
    tasks.push(await response.json());
  }
  return tasks;
}

function compareByDefaultOrder(left, right) {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? -1 : 1;
  }
  if (left.id !== right.id) {
    return left.id < right.id ? -1 : 1;
  }
  return 0;
}

function assertTaskSchema(task) {
  assert.deepEqual(Object.keys(task).sort(), taskKeys);
  assert.match(
    task.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(typeof task.title, "string");
  assert.ok([...task.title].length >= 1 && [...task.title].length <= 100);
  assert.equal(typeof task.description, "string");
  assert.ok([...task.description].length <= 2000);
  assert.ok(["low", "medium", "high"].includes(task.priority));
  assert.ok(["pending", "in_progress", "completed"].includes(task.status));
  assert.ok(Array.isArray(task.tags));
  assert.ok(task.tags.length <= 10);
  for (const tag of task.tags) {
    assert.equal(typeof tag, "string");
    assert.ok([...tag].length >= 1 && [...tag].length <= 30);
  }
  assert.match(
    task.createdAt,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  );
  assert.equal(new Date(task.createdAt).toISOString(), task.createdAt);
  if (task.dueDate !== null) {
    assert.match(task.dueDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(
      new Date(`${task.dueDate}T00:00:00.000Z`).toISOString().slice(0, 10),
      task.dueDate,
    );
  }
}

async function assertTaskListResponse(response, expectedIds) {
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^application\/json(?:\s*;|$)/i,
  );
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["count", "tasks"]);
  assert.ok(Array.isArray(body.tasks));
  assert.ok(Number.isInteger(body.count));
  assert.ok(body.count >= 0);
  assert.equal(body.count, body.tasks.length);
  for (const task of body.tasks) {
    assertTaskSchema(task);
  }
  assert.deepEqual(
    body.tasks.map((task) => task.id),
    expectedIds,
  );
  return body;
}

function taskListUrl(origin, queryEntries) {
  const query = new URLSearchParams(queryEntries).toString();
  return `${origin}/tasks?${query}`;
}

test("HTTP CRUD returns exact success statuses, Location, complete tasks, and empty 204 body", async () => {
  await withServer(async (origin) => {
    const createdResponse = await fetch(`${origin}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "  Prepare report  ",
        description: "Review the draft",
        priority: "medium",
        dueDate: "2026-11-25",
      }),
    });
    assert.equal(createdResponse.status, 201);

    const created = await createdResponse.json();
    assert.deepEqual(Object.keys(created).sort(), taskKeys);
    assert.match(
      created.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.equal(createdResponse.headers.get("location"), `/tasks/${created.id}`);
    assert.match(
      created.createdAt,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    assert.equal(created.title, "Prepare report");
    assert.equal(created.description, "Review the draft");
    assert.equal(created.priority, "medium");
    assert.equal(created.status, "pending");
    assert.deepEqual(created.tags, []);
    assert.equal(created.dueDate, "2026-11-25");

    const retrievedResponse = await fetch(`${origin}/tasks/${created.id}`);
    assert.equal(retrievedResponse.status, 200);
    assert.deepEqual(await retrievedResponse.json(), created);

    const updatedResponse = await fetch(`${origin}/tasks/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Updated report", dueDate: null }),
    });
    assert.equal(updatedResponse.status, 200);
    const updated = await updatedResponse.json();
    assert.deepEqual(updated, {
      ...created,
      title: "Updated report",
      dueDate: null,
    });

    const deletedResponse = await fetch(`${origin}/tasks/${created.id}`, {
      method: "DELETE",
    });
    assert.equal(deletedResponse.status, 204);
    assert.equal(await deletedResponse.text(), "");

    const missingResponse = await fetch(`${origin}/tasks/${created.id}`);
    assert.equal(missingResponse.status, 404);
    assert.deepEqual(await missingResponse.json(), {
      error: {
        code: "TASK_NOT_FOUND",
        message: "Task not found.",
      },
    });
  });
});

test("valid unknown task IDs return 404 for retrieval and deletion", async () => {
  await withServer(async (origin) => {
    const getResponse = await fetch(`${origin}/tasks/${unknownId}`);
    assert.equal(getResponse.status, 404);
    assert.deepEqual(await getResponse.json(), {
      error: {
        code: "TASK_NOT_FOUND",
        message: "Task not found.",
      },
    });

    const deleteResponse = await fetch(`${origin}/tasks/${unknownId}`, {
      method: "DELETE",
    });
    assert.equal(deleteResponse.status, 404);
    assert.deepEqual(await deleteResponse.json(), {
      error: {
        code: "TASK_NOT_FOUND",
        message: "Task not found.",
      },
    });
  });
});

test("list filters and priority sorting return the matching tasks", async () => {
    await withServer(async (origin) => {
      const created = await seedListTasks(origin);
      const defaultExpected = [...created]
        .sort(compareByDefaultOrder)
        .map((task) => task.id);

      const pending = await assertTaskListResponse(
        await fetch(`${origin}/tasks?status=pending`),
        [created[0], created[1]]
          .sort(compareByDefaultOrder)
          .map((task) => task.id),
      );
      const medium = await assertTaskListResponse(
        await fetch(`${origin}/tasks?priority=medium`),
        [created[2].id],
      );
      const tagged = await assertTaskListResponse(
        await fetch(`${origin}/tasks?tags=WORK`),
        [created[0], created[1]]
          .sort(compareByDefaultOrder)
          .map((task) => task.id),
      );
      const sorted = await assertTaskListResponse(
        await fetch(`${origin}/tasks?sort=priority`),
        [created[0].id, created[2].id, created[1].id],
      );

      const defaultList = await assertTaskListResponse(
        await fetch(`${origin}/tasks`),
        defaultExpected,
      );
      const repeatedDefault = await assertTaskListResponse(
        await fetch(`${origin}/tasks`),
        defaultExpected,
      );
      const repeatedSorted = await assertTaskListResponse(
        await fetch(`${origin}/tasks?sort=priority`),
        [created[0].id, created[2].id, created[1].id],
      );
      assert.deepEqual(
        repeatedDefault.tasks.map((task) => task.id),
        defaultList.tasks.map((task) => task.id),
      );
      assert.deepEqual(
        repeatedSorted.tasks.map((task) => task.id),
        sorted.tasks.map((task) => task.id),
      );
      const combinedSorted = await assertTaskListResponse(
        await fetch(
          taskListUrl(origin, [
            ["status", "pending"],
            ["tags", "work"],
            ["sort", "priority"],
          ]),
        ),
        [created[0].id, created[1].id],
      );
      assert.equal(medium.count, 1);
      assert.equal(tagged.count, 2);
      assert.equal(pending.count, 2);
      assert.equal(combinedSorted.count, 2);
    });
  });

  test("list combines supported filters with AND and reports exact counts", async () => {
    await withServer(async (origin) => {
      const created = await seedListTasks(origin);
      const defaultIds = (tasks) =>
        tasks.sort(compareByDefaultOrder).map((task) => task.id);
      const combinations = [
        {
          query: [
            ["status", "pending"],
            ["priority", "high"],
          ],
          matchingTasks: [created[0]],
        },
        {
          query: [
            ["status", "pending"],
            ["tags", "work"],
          ],
          matchingTasks: [created[0], created[1]],
        },
        {
          query: [
            ["priority", "high"],
            ["tags", "work,school"],
          ],
          matchingTasks: [created[0]],
        },
        {
          query: [
            ["status", "pending"],
            ["priority", "high"],
            ["tags", "work,school"],
          ],
          matchingTasks: [created[0]],
        },
      ];

      for (const combination of combinations) {
        await assertTaskListResponse(
          await fetch(taskListUrl(origin, combination.query)),
          defaultIds([...combination.matchingTasks]),
        );
      }

      const noMatches = await assertTaskListResponse(
        await fetch(
          taskListUrl(origin, [
            ["status", "completed"],
            ["priority", "low"],
            ["tags", "school"],
          ]),
        ),
        [],
      );
      assert.equal(noMatches.count, 0);
    });
  });

  test("list rejects repeated query keys and invalid filter or sorting values", async () => {
    await withServer(async (origin) => {
      const tooManyTags = Array.from({ length: 11 }, (_, index) =>
        `tag${index + 1}`,
      ).join(",");
      const invalidQueries = [
        [
          ["status", "pending"],
          ["status", "completed"],
        ],
        [
          ["tags", "Work"],
          ["tags", "School"],
        ],
        [
          ["sort", "priority"],
          ["sort", "priority"],
        ],
        [["status", ""]],
        [["status", "unknown"]],
        [["priority", "urgent"]],
        [["tags", ""]],
        [["tags", "Work,,School"]],
        [["tags", "Work,work"]],
        [["tags", "x".repeat(31)]],
        [["tags", tooManyTags]],
        [["unexpected", "value"]],
        [["sort", "createdAt"]],
        [["sort", ""]],
      ];

      for (const query of invalidQueries) {
        await assertErrorResponse(
          await fetch(taskListUrl(origin, query)),
          400,
          "VALIDATION_ERROR",
          "Request validation failed.",
        );
      }
    });
  });

test("malformed JSON and invalid fields use the specified error envelopes without mutation", async () => {
    await withServer(async (origin) => {
      const beforeResponse = await fetch(`${origin}/tasks`);
      const before = await beforeResponse.json();

      const malformedResponse = await fetch(`${origin}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });
      await assertErrorResponse(
        malformedResponse,
        400,
        "INVALID_JSON",
        "Request body must be valid JSON.",
      );

      const invalidResponse = await postTask(origin, {
        title: "   ",
        description: "",
        priority: "urgent",
      });
      await assertErrorResponse(
        invalidResponse,
        400,
        "VALIDATION_ERROR",
        "Request validation failed.",
      );

      const afterResponse = await fetch(`${origin}/tasks`);
      assert.deepEqual(await afterResponse.json(), before);
    });
  });

  test("malformed storage returns the specified HTTP storage error", async () => {
    await withServer(
      async (origin) => {
        const response = await fetch(`${origin}/tasks`);
        await assertErrorResponse(
          response,
          500,
          "STORAGE_ERROR",
          "Task storage operation failed.",
        );
      },
      { initialStore: "{" },
    );
  });

test("media type and UTF-8 request-size errors use their specified statuses", async () => {
    await withServer(async (origin) => {
      const validTask = {
        title: "Charset request",
        description: "",
        priority: "low",
      };
      const unsupportedResponse = await postTask(
        origin,
        validTask,
        "text/plain",
      );
      await assertErrorResponse(
        unsupportedResponse,
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Content-Type must be application/json.",
      );

      const missingTypeResponse = await fetch(`${origin}/tasks`, {
        method: "POST",
        body: new TextEncoder().encode(JSON.stringify(validTask)),
      });
      await assertErrorResponse(
        missingTypeResponse,
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Content-Type must be application/json.",
      );

      const charsetResponse = await postTask(
        origin,
        validTask,
        "application/json; charset=utf-8",
      );
      assert.equal(charsetResponse.status, 201);

      const boundaryPrefix = JSON.stringify(validTask);
      const boundaryBody =
        boundaryPrefix +
        " ".repeat(65536 - Buffer.byteLength(boundaryPrefix, "utf8"));
      assert.equal(Buffer.byteLength(boundaryBody, "utf8"), 65536);
      const boundaryResponse = await fetch(`${origin}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: boundaryBody,
      });
      assert.equal(boundaryResponse.status, 201);

      const oversizedResponse = await fetch(`${origin}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "😀".repeat(16385),
      });
      await assertErrorResponse(
        oversizedResponse,
        413,
        "PAYLOAD_TOO_LARGE",
        "Request body exceeds 65536 bytes.",
      );
    });
  });

test("unsupported methods, unknown routes, and malformed IDs use exact error contracts", async () => {
    await withServer(async (origin) => {
      const methodResponse = await fetch(`${origin}/tasks`, {
        method: "PUT",
      });
      await assertErrorResponse(
        methodResponse,
        405,
        "METHOD_NOT_ALLOWED",
        "Method not allowed.",
      );

      const routeResponse = await fetch(`${origin}/not-a-route`);
      await assertErrorResponse(
        routeResponse,
        404,
        "ROUTE_NOT_FOUND",
        "Route not found.",
      );

      const idResponse = await fetch(`${origin}/tasks/not-a-uuid`);
      await assertErrorResponse(
        idResponse,
        400,
        "INVALID_TASK_ID",
        "Task ID must be a UUID.",
      );
    });
  });

test("production server binds only to IPv4 loopback", async () => {
  await withServer(async (origin, address) => {
    assert.equal(address.address, "127.0.0.1");
    const response = await fetch(`${origin}/tasks`);
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }, { production: true });
});
