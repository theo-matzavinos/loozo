import { stats, userTodos } from "./store.server";

export async function createContext(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)proof-user=([a-z]+)/.exec(cookies);
  let user: string | null = null;

  if (match) {
    user = match[1];
  }

  stats.contexts += 1;

  return { request, user, requestId: stats.contexts, db: { userTodos }, metrics: stats };
}

export type RequestContext = Awaited<ReturnType<typeof createContext>>;

export function isRequestContext(value: unknown): value is RequestContext {
  return (
    typeof value === "object" &&
    value !== null &&
    "request" in value &&
    value.request instanceof Request &&
    "requestId" in value &&
    typeof value.requestId === "number" &&
    "user" in value &&
    (typeof value.user === "string" || value.user === null)
  );
}
