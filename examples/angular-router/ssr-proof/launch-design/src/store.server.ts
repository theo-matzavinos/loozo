import type { Todo } from "./wire";

// Intentionally retained in the server build; forbidden in browser output.
export const serverOnlySentinel = "LAUNCH_SERVER_ONLY_SECRET_SENTINEL_7f089a";
export const rows = new Map<string, Todo[]>();
export const stats = {
  contexts: 0,
  directQueries: 0,
  httpQueries: 0,
  mutations: 0,
  groupGuards: 0,
  procedureGuards: 0,
  denied: 0,
  slowStarted: 0,
  slowFinished: 0,
};

export function userTodos(user: string): Todo[] {
  let todos = rows.get(user);

  if (!todos) {
    todos = [{ id: "1", title: `${user}: Design Launch`, completed: false }];
    rows.set(user, todos);
  }

  return todos;
}
