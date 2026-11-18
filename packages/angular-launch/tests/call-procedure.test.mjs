import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import { defineRoute as defineRouterRoute } from "@loozo/angular-router";
import { defineRoute } from "../dist/index.js";
import { forbidden, notFound, redirect } from "../dist/server/index.js";
import { callProcedure } from "../dist/testing/index.js";
import { signIn } from "./fixtures/destinations.mjs";

const idSchema = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value) => {
      if (typeof value !== "object" || value === null || typeof value.id !== "string") {
        return { issues: [{ message: "Expected a todo id", path: ["id"] }] };
      }

      return { value: { id: value.id } };
    },
  },
};

// Runs `run` with console.error captured, returning its result and what it logged.
async function logged(run) {
  const entries = [];
  const previous = console.error;

  console.error = (...args) => entries.push(args);

  try {
    return { value: await run(), entries };
  } finally {
    console.error = previous;
  }
}

const completed = { id: "1", completed: true };

// An app shaped like a real one: the root stage reads the session, a child stage requires a
// user, and the child's route declares the `todos` namespace.
function app({ rootStage = () => ({ user: "from the real root" }), use = [], procedures } = {}) {
  const root = defineRoute("", {}).context(rootStage);
  const signedIn = defineRoute("", { parent: root }).context(({ context }) => {
    if (context.user === null) {
      throw redirect(signIn, {});
    }

    return { ...context, user: context.user, signedIn: true };
  });
  let todos = defineRoute("todos", { parent: signedIn });

  if (use.length > 0) {
    todos = todos.use(...use);
  }

  todos = todos.remote(
    procedures ??
      (({ query, mutation }) => ({
        todos: {
          list: query({ handler: ({ context }) => [{ owner: context.user }] }),
          complete: mutation({
            input: idSchema,
            errors: {
              NOT_FOUND: { status: 404, message: "Todo does not exist", data: idSchema },
            },
            handler: ({ input, errors }) => {
              if (input.id !== "1") {
                throw errors.NOT_FOUND({ id: input.id });
              }

              return completed;
            },
          }),
        },
      })),
  );

  return { root, signedIn, todos };
}

test("a result settles to status 200 with the result as the wire carries it, and no cookies or headers", async () => {
  const { todos } = app();
  const call = await callProcedure(todos, "todos", "complete", {
    context: { user: "alice" },
    input: { id: "1" },
  });

  assert.deepEqual(
    { status: call.status, result: call.result, cookies: call.cookies },
    { status: 200, result: { id: "1", completed: true }, cookies: [] },
  );
  // Strict JSON, parsed back: a copy of what the handler returned.
  assert.notEqual(call.result, completed);
  assert.deepEqual([...call.headers], []);
});

test("a declared error settles to its frame and status, with its data as its schema produced it", async () => {
  const { todos } = app();
  const call = await callProcedure(todos, "todos", "complete", {
    context: { user: "alice" },
    input: { id: "2" },
  });

  assert.equal(call.status, 404);
  assert.deepEqual(call.error, {
    code: "NOT_FOUND",
    message: "Todo does not exist",
    data: { id: "2" },
  });
});

test("the root stage never runs: the supplied context reaches the stage below it, and its value the handler", async () => {
  let rootRuns = 0;
  const seen = [];
  const supplied = { user: "alice", db: "fake" };
  const { todos } = app({
    rootStage: () => {
      rootRuns += 1;

      return { user: "from the real root" };
    },
    procedures: ({ query }) => ({
      todos: {
        list: query({
          handler: ({ context }) => {
            seen.push(context);

            return context.db;
          },
        }),
      },
    }),
  });

  const call = await callProcedure(todos, "todos", "list", { context: supplied });

  assert.equal(rootRuns, 0);
  assert.deepEqual(call.result, "fake");
  assert.deepEqual(seen, [{ user: "alice", db: "fake", signedIn: true }]);
});

test("redirect() from a stage below the root settles to the 303 frame", async () => {
  const { todos } = app();
  const call = await callProcedure(todos, "todos", "list", { context: { user: null } });

  assert.deepEqual(
    { status: call.status, redirect: call.redirect },
    { status: 303, redirect: { to: "/sign-in" } },
  );
});

test("forbidden() and notFound() settle to FORBIDDEN and the 404 not-found frame", async () => {
  const { todos } = app({
    procedures: ({ query }) => ({
      todos: {
        hidden: query({
          handler: () => {
            throw forbidden();
          },
        }),
        gone: query({
          handler: () => {
            throw notFound();
          },
        }),
      },
    }),
  });

  const hidden = await callProcedure(todos, "todos", "hidden", { context: { user: "alice" } });
  const gone = await callProcedure(todos, "todos", "gone", { context: { user: "alice" } });

  assert.deepEqual(
    { status: hidden.status, error: hidden.error },
    { status: 403, error: { code: "FORBIDDEN", message: "RPC forbidden", data: null } },
  );
  assert.deepEqual(
    { status: gone.status, notFound: gone.notFound },
    { status: 404, notFound: null },
  );
});

test("input the schema refuses, or input for a procedure without one, settles to INVALID_INPUT", async () => {
  const { todos } = app();
  const refused = await callProcedure(todos, "todos", "complete", {
    context: { user: "alice" },
    input: { id: 1 },
  });
  const unexpected = await callProcedure(todos, "todos", "list", {
    context: { user: "alice" },
    input: { id: "1" },
  });

  assert.equal(refused.status, 400);
  assert.deepEqual(refused.error, {
    code: "INVALID_INPUT",
    message: "Invalid RPC input",
    data: { issues: [{ path: ["id"], message: "Expected a todo id" }] },
  });
  assert.equal(unexpected.status, 400);
  assert.deepEqual(unexpected.error.data, { issues: [] });
});

test("the declaring route's .use() runs, a bare arrow included; a child route's procedure doesn't run it", async () => {
  const runs = [];
  const { todos } = app({
    use: [
      async ({ context, next }) => {
        runs.push(`bare ${context.user}`);

        return next();
      },
      {
        run: async ({ next }) => {
          runs.push("middleware()");

          return next();
        },
      },
    ],
  });
  const child = defineRoute("detail", { parent: todos }).remote(({ query }) => ({
    todo: { read: query({ handler: () => "child" }) },
  }));

  await callProcedure(todos, "todos", "list", { context: { user: "alice" } });

  assert.deepEqual(runs, ["bare alice", "middleware()"]);

  const call = await callProcedure(child, "todo", "read", { context: { user: "alice" } });

  assert.equal(call.result, "child");
  assert.deepEqual(runs, ["bare alice", "middleware()"]);
});

test("cookies and headers set by a stage, middleware and the handler come back with the call", async () => {
  const root = defineRoute("", {}).context(() => ({ user: "real" }));
  const route = defineRoute("todos", { parent: root })
    .context(({ context, response }) => {
      response.setCookie("stage", "1");
      response.headers.set("x-stage", "1");

      return context;
    })
    .use(async ({ response, next }) => {
      response.setCookie("middleware", "1", { path: "/todos" });
      response.headers.set("x-middleware", "1");

      return next();
    })
    .remote(({ mutation }) => ({
      todos: {
        add: mutation({
          handler: ({ response }) => {
            response.setCookie("handler", "1");
            response.headers.set("x-handler", "1");

            return null;
          },
        }),
      },
    }));

  const call = await callProcedure(route, "todos", "add", { context: { user: "alice" } });

  assert.deepEqual(call.cookies, [
    "stage=1; Path=/; HttpOnly; Secure; SameSite=Lax",
    "middleware=1; Path=/todos; HttpOnly; Secure; SameSite=Lax",
    "handler=1; Path=/; HttpOnly; Secure; SameSite=Lax",
  ]);
  assert.deepEqual(
    [...call.headers],
    [
      ["x-handler", "1"],
      ["x-middleware", "1"],
      ["x-stage", "1"],
    ],
  );
});

test("a header written after the call settled doesn't reach it, as it doesn't reach the HTTP response", async () => {
  let late;
  const root = defineRoute("", {}).context(() => ({}));
  const route = defineRoute("todos", { parent: root }).remote(({ query }) => ({
    todos: {
      list: query({
        handler: ({ response }) => {
          response.headers.set("x-phase", "settled");
          late = () => response.headers.set("x-phase", "late");

          return null;
        },
      }),
    },
  }));

  const call = await callProcedure(route, "todos", "list", { context: {} });

  late();

  assert.equal(call.headers.get("x-phase"), "settled");
});

test("an unexpected failure settles to INTERNAL, logged as the server logs it", async () => {
  const cause = new Error("database down");
  const { todos } = app({
    procedures: ({ query }) => ({
      todos: {
        list: query({
          handler: () => {
            throw cause;
          },
        }),
      },
    }),
  });

  const { value: call, entries } = await logged(() =>
    callProcedure(todos, "todos", "list", { context: { user: "alice" } }),
  );

  assert.deepEqual(
    { status: call.status, error: call.error },
    { status: 500, error: { code: "INTERNAL", message: "Internal server error", data: null } },
  );
  assert.deepEqual(entries, [["Launch RPC failed", cause]]);
});

test("a stage below the root that fails unexpectedly settles to INTERNAL, logged", async () => {
  const cause = new Error("stage failed");
  const root = defineRoute("", {}).context(() => ({ user: "real" }));
  const route = defineRoute("todos", { parent: root })
    .context(() => {
      throw cause;
    })
    .remote(({ query }) => ({ todos: { list: query({ handler: () => [] }) } }));

  const { value: call, entries } = await logged(() =>
    callProcedure(route, "todos", "list", { context: { user: "alice" } }),
  );

  assert.equal(call.status, 500);
  assert.equal(call.error.code, "INTERNAL");
  assert.deepEqual(entries, [["Launch context stage failed", cause]]);
});

test("a root route's own namespace runs with the supplied context, and {} without a root stage", async () => {
  const seen = [];
  const staged = defineRoute("", {})
    .context(() => ({ user: "real" }))
    .remote(({ query }) => ({
      session: { current: query({ handler: ({ context }) => seen.push(context) && context.user }) },
    }));
  const bare = defineRoute("", {}).remote(({ query }) => ({
    health: { ok: query({ handler: ({ context }) => seen.push(context) && "ok" }) },
  }));

  const current = await callProcedure(staged, "session", "current", { context: { user: "alice" } });
  const ok = await callProcedure(bare, "health", "ok", { context: {} });

  assert.equal(current.result, "alice");
  assert.equal(ok.result, "ok");
  assert.deepEqual(seen, [{ user: "alice" }, {}]);
});

test("a custom request's headers and signal reach the stages, middleware and the handler", async () => {
  const controller = new AbortController();
  const request = new Request("http://localhost/todos", {
    headers: { cookie: "session=alice" },
    signal: controller.signal,
  });
  const seen = [];
  const root = defineRoute("", {}).context(() => ({ user: "real" }));
  const route = defineRoute("todos", { parent: root })
    .context(({ context, request, signal }) => {
      seen.push(["stage", request.headers.get("cookie"), signal.aborted]);

      return context;
    })
    .use(async ({ request, signal, next }) => {
      seen.push(["middleware", request.headers.get("cookie"), signal.aborted]);

      return next();
    })
    .remote(({ query }) => ({
      todos: {
        list: query({
          handler: ({ request, signal }) => {
            seen.push(["handler", request.headers.get("cookie"), signal.aborted]);
            controller.abort();
            seen.push(["aborted", signal.aborted]);

            return null;
          },
        }),
      },
    }));

  await callProcedure(route, "todos", "list", { context: {}, request });

  assert.deepEqual(seen, [
    ["stage", "session=alice", false],
    ["middleware", "session=alice", false],
    ["handler", "session=alice", false],
    ["aborted", true],
  ]);
});

test("the default request is a POST to the procedure's path", async () => {
  const route = defineRoute("", {}).remote(({ query }) => ({
    todos: { list: query({ handler: ({ request }) => `${request.method} ${request.url}` }) },
  }));

  const call = await callProcedure(route, "todos", "list", { context: {} });

  assert.equal(call.result, "POST http://localhost/_rpc/todos/list");
});

test("streams, channels, an ancestor's namespace, an unknown procedure and a route Launch didn't make are TypeErrors", async () => {
  const messageSchema = {
    "~standard": { version: 1, vendor: "test", validate: (value) => ({ value }) },
  };
  const root = defineRoute("", {}).remote(({ query }) => ({
    session: { current: query({ handler: () => null }) },
  }));
  const route = defineRoute("live", { parent: root }).remote(({ stream, channel }) => ({
    live: {
      ticks: stream({ handler: async function* () {} }),
      chat: channel({ message: messageSchema, handler: async function* () {} }),
    },
  }));
  const plain = defineRouterRoute("plain", {});
  const cases = [
    [() => callProcedure(route, "live", "ticks", { context: {} }), /not a stream/],
    [() => callProcedure(route, "live", "chat", { context: {} }), /not a channel/],
    [() => callProcedure(route, "session", "current", { context: {} }), /namespace session/],
    [() => callProcedure(route, "live", "missing", { context: {} }), /no procedure missing/],
    [() => callProcedure(plain, "live", "ticks", { context: {} }), /Launch's defineRoute/],
    [() => callProcedure({}, "live", "ticks", { context: {} }), /genuine route/],
  ];

  for (const [call, message] of cases) {
    await assert.rejects(
      call,
      (error) => error instanceof TypeError && message.test(error.message),
    );
  }
});
