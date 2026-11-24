import { callProcedure } from "@loozo/angular-launch/testing";
import { describe, expect, it } from "vite-plus/test";
import type { Todo } from "../../todos.server.js";
import todos from "./route.js";

// What the root route's stage returns, with a store holding one todo in place of the real one.
function rootContext(user: { id: string } | null) {
  const milk: Todo = { id: "1", title: "Buy milk", completed: false };

  return {
    user,
    todos: {
      async listForUser() {
        return [milk];
      },
      async completeForUser(_user: string, id: string) {
        if (id !== milk.id) {
          return null;
        }

        return { ...milk, completed: true };
      },
    },
  };
}

describe("todos.complete", () => {
  it("completes the user's todo", async () => {
    const call = await callProcedure(todos, "todos", "complete", {
      context: rootContext({ id: "alice" }),
      input: { id: "1" },
    });

    expect(call).toMatchObject({
      status: 200,
      result: { id: "1", title: "Buy milk", completed: true },
    });
  });

  it("answers NOT_FOUND for a todo the user doesn't have", async () => {
    const call = await callProcedure(todos, "todos", "complete", {
      context: rootContext({ id: "alice" }),
      input: { id: "2" },
    });

    expect(call).toMatchObject({
      status: 404,
      error: { code: "NOT_FOUND", message: "Todo does not exist", data: { id: "2" } },
    });

    // The declared error's data is typed once its code narrows it.
    if ("error" in call && call.error.code === "NOT_FOUND") {
      const id: string = call.error.data.id;

      expect(id).toBe("2");
    }
  });

  it("refuses callers without a session through the signedIn stage", async () => {
    const call = await callProcedure(todos, "todos", "complete", {
      context: rootContext(null),
      input: { id: "1" },
    });

    expect(call).toMatchObject({ status: 403, error: { code: "FORBIDDEN" } });
  });

  it("rejects input the schema refuses", async () => {
    const call = await callProcedure(todos, "todos", "complete", {
      context: rootContext({ id: "alice" }),
      // The input is typed, so input the schema refuses needs a cast.
      input: { id: 1 } as never,
    });

    expect(call).toMatchObject({
      status: 400,
      error: {
        code: "INVALID_INPUT",
        data: { issues: [{ path: ["id"], message: "Expected a todo id" }] },
      },
    });
  });
});

describe("todos.list", () => {
  it("lists the user's todos", async () => {
    const call = await callProcedure(todos, "todos", "list", {
      context: rootContext({ id: "alice" }),
    });

    expect(call).toMatchObject({ status: 200, result: [{ id: "1" }], cookies: [] });
  });
});
