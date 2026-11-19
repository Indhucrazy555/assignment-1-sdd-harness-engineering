import { createServer as createHttpServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { TaskRepository } from "./domain/task.ts";
import { createTaskRequestHandler } from "./http/task-routes.ts";
import { JsonTaskStore } from "./persistence/json-task-store.ts";
import { TaskService } from "./services/task-service.ts";

export interface ServerOptions {
  store?: TaskRepository;
  storePath?: string;
  port?: number;
}

export function createServer(options: ServerOptions = {}): Server {
  const store =
    options.store ?? new JsonTaskStore(options.storePath);
  const service = new TaskService(store);
  return createHttpServer(createTaskRequestHandler(service));
}

export async function startServer(options: ServerOptions = {}): Promise<Server> {
  const server = createServer(options);
  const port = options.port ?? 3000;

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  return server;
}

const entryPath = process.argv[1];
if (
  entryPath &&
  import.meta.url === pathToFileURL(resolve(entryPath)).href
) {
  void startServer().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
