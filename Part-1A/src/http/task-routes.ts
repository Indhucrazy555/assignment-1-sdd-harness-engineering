import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
import { TextDecoder } from "node:util";
import { apiErrors, ApiError } from "../errors/api-error.ts";
import { TaskStoreError } from "../persistence/json-task-store.ts";
import { TaskNotFoundError, TaskService } from "../services/task-service.ts";
import {
  validateCreateTask,
  validateListQuery,
  validateUpdateTask,
} from "../validation/task-validation.ts";

const taskIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const maxRequestBodyBytes = 65_536;

export function createTaskRequestHandler(service: TaskService) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    void dispatch(request, response, service).catch((error: unknown) => {
      sendError(response, toApiError(error));
    });
  };
}

async function dispatch(
  request: IncomingMessage,
  response: ServerResponse,
  service: TaskService,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/tasks") {
    if (request.method === "POST") {
      assertJsonContentType(request);
      const input = validateCreateTask(await readJsonBody(request));
      const task = await service.create(input);
      sendJson(response, 201, task, { location: `/tasks/${task.id}` });
      return;
    }
    if (request.method === "GET") {
      const query = validateListQuery(url.searchParams);
      const tasks = await service.list(query);
      sendJson(response, 200, { tasks, count: tasks.length });
      return;
    }
    throw apiErrors.methodNotAllowed();
  }

  const match = /^\/tasks\/([^/]+)$/.exec(url.pathname);
  if (!match) {
    throw apiErrors.routeNotFound();
  }

  const id = match[1];
  if (request.method === "GET") {
    assertValidTaskId(id);
    sendJson(response, 200, await service.getById(id));
    return;
  }
  if (request.method === "PATCH") {
    assertValidTaskId(id);
    assertJsonContentType(request);
    const input = validateUpdateTask(await readJsonBody(request));
    sendJson(response, 200, await service.patch(id, input));
    return;
  }
  if (request.method === "DELETE") {
    assertValidTaskId(id);
    await service.delete(id);
    response.writeHead(204);
    response.end();
    return;
  }
  throw apiErrors.methodNotAllowed();
}

function assertValidTaskId(id: string): void {
  if (!taskIdPattern.test(id)) {
    throw apiErrors.invalidTaskId();
  }
}

function assertJsonContentType(request: IncomingMessage): void {
  const contentType = request.headers["content-type"];
  if (
    typeof contentType !== "string" ||
    !/^\s*application\/json\s*(?:;\s*charset\s*=\s*(?:"utf-8"|utf-8)\s*)?$/i.test(
      contentType,
    )
  ) {
    throw apiErrors.unsupportedMediaType();
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bytes.byteLength;
    if (totalBytes > maxRequestBodyBytes) {
      request.resume();
      throw apiErrors.payloadTooLarge();
    }
    chunks.push(bytes);
  }

  let parsed: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    parsed = JSON.parse(text);
  } catch {
    throw apiErrors.invalidJson();
  }
  return parsed;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof TaskNotFoundError) {
    return apiErrors.taskNotFound();
  }
  if (error instanceof TaskStoreError) {
    return apiErrors.storageError();
  }
  return apiErrors.internalError();
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function sendError(response: ServerResponse, error: ApiError): void {
  sendJson(response, error.status, error.toResponseBody());
}
