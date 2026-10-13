import { idSchema, titleSchema } from "../type-proof/schemas";
import type { RequestContext } from "./context.server";
import { serverOnlySentinel } from "./store.server";
import type { Failure } from "./wire";
import { serializeJson } from "./json";

export type Reply = { status: number; body: unknown };

function failure(
  status: number,
  code: Failure["error"]["code"],
  message: string,
  data: { id: string } | null = null,
): Reply {
  return { status, body: { error: { code, message, data } } satisfies Failure };
}

// Real JSON roundtrip on both paths; no raw server values escape the SSR backend.
function jsonReply(value: unknown): Reply {
  return { status: 200, body: JSON.parse(serializeJson(value)) };
}

export async function dispatch(
  path: string,
  envelope: unknown,
  context: RequestContext,
  rendering: boolean,
): Promise<Reply> {
  const stats = context.metrics;
  const procedure = path.slice("/_rpc/g_todos/".length);
  const knownQuery = procedure === "list" || procedure === "slow" || procedure === "invalid-result";
  const knownMutation = procedure === "add" || procedure === "complete";

  if (!knownQuery && !knownMutation) {
    return failure(404, "NOT_FOUND", "Procedure does not exist", { id: procedure });
  }

  if (rendering && knownMutation) {
    return failure(403, "FORBIDDEN", "Mutations are forbidden during rendering");
  }

  if (typeof envelope !== "object" || envelope === null || !("input" in envelope)) {
    return failure(400, "INVALID_INPUT", "Missing input envelope");
  }

  const rawInput = envelope.input;
  let title: string | undefined;
  let id: string | undefined;

  if (procedure === "add") {
    const parsed = await titleSchema["~standard"].validate(rawInput);

    if (parsed.issues) {
      return failure(400, "INVALID_INPUT", parsed.issues[0].message);
    }

    title = parsed.value.title;
  }

  if (procedure === "complete") {
    const parsed = await idSchema["~standard"].validate(rawInput);

    if (parsed.issues) {
      return failure(400, "INVALID_INPUT", parsed.issues[0].message);
    }

    id = parsed.value.id;
  }

  stats.groupGuards += 1;

  if (context.user === null) {
    stats.denied += 1;

    return failure(403, "FORBIDDEN", "Sign in required");
  }

  if (knownMutation) {
    stats.procedureGuards += 1;

    if (context.user === "readonly") {
      stats.denied += 1;

      return failure(403, "FORBIDDEN", "Editing denied");
    }
  }

  const todos = context.db.userTodos(context.user);

  if (knownQuery) {
    if (rendering) {
      stats.directQueries += 1;
    } else {
      stats.httpQueries += 1;
    }

    if (procedure === "invalid-result") {
      return jsonReply({ date: new Date() });
    }

    if (procedure === "slow") {
      stats.slowStarted += 1;
      await new Promise((resolve) => setTimeout(resolve, 600));
      stats.slowFinished += 1;
    }

    // Keep concurrent proof renders overlapping, like an asynchronous database read.
    await new Promise((resolve) => setTimeout(resolve, 30));

    return jsonReply({ user: context.user, requestId: context.requestId, todos });
  }

  if (procedure === "add" && title !== undefined) {
    const todo = { id: String(todos.length + 1), title, completed: false };

    todos.push(todo);
    stats.mutations += 1;

    return jsonReply(todo);
  }

  if (procedure === "complete" && id !== undefined) {
    const todo = todos.find((candidate) => candidate.id === id);

    if (!todo) {
      return failure(404, "NOT_FOUND", "Todo does not exist", { id });
    }

    todo.completed = true;
    stats.mutations += 1;

    return jsonReply(todo);
  }

  throw new Error(serverOnlySentinel);
}
