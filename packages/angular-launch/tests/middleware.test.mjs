import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEnvironmentInjector, REQUEST, REQUEST_CONTEXT } from "@angular/core";
import { FetchBackend, HttpBackend, HttpRequest } from "@angular/common/http";
import { defineContext, defineRpc, forbidden, middleware } from "../dist/server/index.js";
import { createRequestScope, handleRpc, provideLaunchServer } from "../dist/server/generated.js";
import { dispatch } from "../dist/server/dispatch.js";

const id = "todos";
const path = `/_rpc/${id}/read`;
const application = {
  id: "launch-middleware-test-app",
  context: defineContext((request) => ({ user: request.headers.get("cookie"), value: 1 })),
};
const page = new Request("http://test/todos", { headers: { cookie: "alice" } });

function group(build, use = []) {
  return { [id]: defineRpc(id, build, { use }) };
}

async function call(registry, { input = null, mode = "http", scope } = {}) {
  const bound = scope ?? (await createRequestScope(application, page));

  return dispatch(registry, path, { input }, bound, application, bound.request, mode);
}

// Runs `run` with console.error captured, returning what it logged.
async function logged(run) {
  const entries = [];
  const previous = console.error;

  console.error = (...args) => entries.push(args);

  try {
    await run();
  } finally {
    console.error = previous;
  }

  return entries;
}

const lengthSchema = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value) => {
      if (typeof value !== "string") {
        return { issues: [{ message: "Expected a string" }] };
      }

      return { value: { text: value, length: value.length } };
    },
  },
};

test("next(added) merges into the context for later middleware and the handler; next() keeps it", async () => {
  const scope = await createRequestScope(application, page);
  let groupContext;
  const registry = group(
    ({ query }) => ({
      read: query({
        input: lengthSchema,
        use: [
          middleware(async ({ context, input, next }) => {
            // Procedure middleware gets the schema's transformed output.
            assert.deepEqual(input, { text: "abc", length: 3 });
            assert.equal(context.user, "ALICE");

            return next({ todo: input.length, value: 2 });
          }),
        ],
        handler: ({ context }) => context,
      }),
    }),
    [
      middleware(async ({ context, next }) => {
        groupContext = context;

        return next();
      }),
      middleware(async ({ context, next }) => {
        // next() without values passes the very same context on.
        assert.equal(context, groupContext);

        return next({ user: context.user.toUpperCase() });
      }),
    ],
  );

  assert.deepEqual(await call(registry, { input: "abc", scope }), {
    status: 200,
    body: { user: "ALICE", value: 2, todo: 3 },
  });
  assert.equal(groupContext, scope.value);
  assert.deepEqual(scope.value, { user: "alice", value: 1 });
});

test("next() rejects with what the rest of the call threw, so a wrapper sees it and the reply stays the same", async () => {
  const seen = [];
  const wrapper = middleware(async ({ next }) => {
    try {
      const result = await next();

      seen.push("committed");

      return result;
    } catch (error) {
      seen.push(`rolled back: ${error.message}`);

      throw error;
    }
  });
  const nullSchema = {
    "~standard": { version: 1, vendor: "test", validate: (value) => ({ value }) },
  };
  const registry = group(
    ({ query }) => ({
      read: query({
        errors: { BUSY: { status: 409, message: "Busy", data: nullSchema } },
        handler: ({ errors }) => {
          throw errors.BUSY(null);
        },
      }),
    }),
    [wrapper],
  );

  assert.deepEqual(await call(registry), {
    status: 409,
    body: { error: { code: "BUSY", message: "Busy", data: null } },
  });

  const refused = group(
    ({ query }) => ({
      read: query({
        use: [
          middleware(async () => {
            throw forbidden();
          }),
        ],
        handler: () => "unreachable",
      }),
    }),
    [wrapper],
  );

  assert.equal((await call(refused)).status, 403);

  const failing = group(
    ({ query }) => ({
      read: query({
        handler: () => {
          throw new Error("private bug");
        },
      }),
    }),
    [wrapper],
  );
  const logs = await logged(async () => {
    assert.equal((await call(failing)).status, 500);
  });

  assert.equal(logs.length, 1);

  const succeeding = group(({ query }) => ({ read: query({ handler: () => 1 }) }), [wrapper]);

  assert.deepEqual(await call(succeeding), { status: 200, body: 1 });

  // Invalid input is a reply, not a throw, so a group wrapper's next() resolves.
  const invalid = group(
    ({ query }) => ({ read: query({ input: lengthSchema, handler: () => 1 }) }),
    [wrapper],
  );
  const invalidReply = await call(invalid, { input: 1 });

  assert.equal(invalidReply.status, 400);
  assert.equal(invalidReply.body.error.code, "INVALID_INPUT");
  assert.deepEqual(seen, [
    "rolled back: Busy",
    "rolled back: RPC forbidden",
    "rolled back: private bug",
    "committed",
    "committed",
  ]);
});

test("calling next() twice or not returning its result fails the call with INTERNAL, logged", async () => {
  const runs = { handler: 0 };
  const misuses = {
    twice: middleware(async ({ next }) => {
      await next();

      return next();
    }),
    "twice, second swallowed": middleware(async ({ next }) => {
      const result = await next();

      try {
        await next();
      } catch {
        // Swallowing the second call's rejection doesn't make it valid.
      }

      return result;
    }),
    "twice, second turned into forbidden()": middleware(async ({ next }) => {
      await next();

      try {
        await next();
      } catch {
        // A refusal thrown after a second call doesn't make it valid either.
        throw forbidden();
      }
    }),
    "not returned": middleware(async ({ next }) => {
      await next();

      return undefined;
    }),
    "never called": middleware(async () => ({})),
    "another value": middleware(async ({ next }) => {
      await next();

      return { ok: true };
    }),
  };

  for (const [name, misuse] of Object.entries(misuses)) {
    const registry = group(({ query }) => ({
      read: query({
        use: [misuse],
        handler: () => {
          runs.handler += 1;

          return "ran";
        },
      }),
    }));
    let reply;
    const logs = await logged(async () => {
      reply = await call(registry);
    });

    assert.deepEqual(
      reply,
      {
        status: 500,
        body: { error: { code: "INTERNAL", message: "Internal server error", data: null } },
      },
      name,
    );
    assert.equal(logs.length, 1, name);
  }

  // Only "never called" skipped the handler.
  assert.equal(runs.handler, 5);
});

test("a next() left unawaited never causes an unhandled rejection, and a failure no middleware rethrew is logged", async () => {
  const internal = {
    status: 500,
    body: { error: { code: "INTERNAL", message: "Internal server error", data: null } },
  };
  const rejections = [];
  const record = (reason) => rejections.push(reason);

  // Unhandled rejections are reported once the microtask queue drains.
  function drained() {
    return new Promise((resolve) => setTimeout(resolve, 10));
  }

  process.on("unhandledRejection", record);

  try {
    const twice = group(({ query }) => ({
      read: query({
        use: [
          middleware(async ({ next }) => {
            const result = await next();

            void next();

            return result;
          }),
        ],
        handler: () => "ran",
      }),
    }));
    let reply;
    const twiceLogs = await logged(async () => {
      reply = await call(twice);
      await drained();
    });

    assert.deepEqual(reply, internal);
    assert.equal(twiceLogs.length, 1);

    let release;
    const released = new Promise((resolve) => {
      release = resolve;
    });
    const detached = group(({ query }) => ({
      read: query({
        use: [
          middleware(async ({ next }) => {
            void next();

            return undefined;
          }),
        ],
        handler: async () => {
          await released;

          throw new Error("late failure");
        },
      }),
    }));
    const detachedLogs = await logged(async () => {
      reply = await call(detached);
      // The call ended while its handler still runs; the handler fails afterwards.
      release();
      await drained();
    });

    assert.deepEqual(reply, internal);
    assert.equal(detachedLogs.length, 2);
    assert.equal(detachedLogs[1][1].message, "late failure");

    // A failure that settled before the middleware refused is still logged: the refusal
    // replaced it, whether the middleware left next() detached or awaited and caught it.
    const forbiddenReply = {
      status: 403,
      body: { error: { code: "FORBIDDEN", message: "RPC forbidden", data: null } },
    };
    const refusals = {
      detached: middleware(async ({ next }) => {
        void next();
        await new Promise((resolve) => setTimeout(resolve, 0));

        throw forbidden();
      }),
      caught: middleware(async ({ next }) => {
        try {
          return await next();
        } catch {
          throw forbidden();
        }
      }),
    };

    for (const [name, refusal] of Object.entries(refusals)) {
      const registry = group(({ query }) => ({
        read: query({
          use: [refusal],
          handler: () => {
            throw new Error("database failure");
          },
        }),
      }));
      const logs = await logged(async () => {
        reply = await call(registry);
        await drained();
      });

      assert.deepEqual(reply, forbiddenReply, name);
      assert.equal(logs.length, 1, name);
      assert.equal(logs[0][1].message, "database failure", name);
    }

    assert.deepEqual(rejections, []);
  } finally {
    process.off("unhandledRejection", record);
  }
});

test("forbidden() from group middleware, procedure middleware or the handler is FORBIDDEN; other throws are INTERNAL", async () => {
  const refuse = middleware(async () => {
    throw forbidden();
  });
  const forbiddenReply = {
    status: 403,
    body: { error: { code: "FORBIDDEN", message: "RPC forbidden", data: null } },
  };

  for (const registry of [
    group(({ query }) => ({ read: query({ handler: () => 1 }) }), [refuse]),
    group(({ query }) => ({ read: query({ use: [refuse], handler: () => 1 }) })),
    group(({ query }) => ({
      read: query({
        handler: () => {
          throw forbidden();
        },
      }),
    })),
  ]) {
    const logs = await logged(async () => {
      assert.deepEqual(await call(registry), forbiddenReply);
    });

    assert.deepEqual(logs, []);
  }

  // The brand is a non-enumerable Symbol.for key, so a second copy of the module agrees
  // and JSON or a lookalike can't produce it.
  const copy = await import(`../dist/server/outcomes.js?copy=${Date.now()}`);
  const copied = copy.forbidden();

  assert.deepEqual(Object.keys(copied), []);
  assert.equal(JSON.stringify({ ...copied }), "{}");
  assert.deepEqual(
    await call(
      group(
        ({ query }) => ({ read: query({ handler: () => 1 }) }),
        [
          middleware(async () => {
            throw copied;
          }),
        ],
      ),
    ),
    forbiddenReply,
  );

  for (const thrown of [
    new Error("private failure"),
    Object.assign(new Error("RPC forbidden"), { kind: "forbidden" }),
    { [Symbol("@loozo/angular-launch/outcome/v1")]: { kind: "forbidden" } },
  ]) {
    const registry = group(
      ({ query }) => ({ read: query({ handler: () => 1 }) }),
      [
        middleware(async () => {
          throw thrown;
        }),
      ],
    );
    let reply;
    const logs = await logged(async () => {
      reply = await call(registry);
    });

    assert.equal(reply.status, 500);
    assert.equal(JSON.stringify(reply).includes("private"), false);
    assert.equal(logs.length, 1);
  }
});

test("rendering refuses a mutation before any middleware runs", async () => {
  let runs = 0;
  const counting = middleware(async ({ next }) => {
    runs += 1;

    return next();
  });
  const registry = {
    [id]: defineRpc(
      id,
      ({ query, mutation }) => ({
        read: query({ use: [counting], handler: () => "read" }),
        write: mutation({ use: [counting], handler: () => "written" }),
      }),
      { use: [counting] },
    ),
  };
  const scope = await createRequestScope(application, page);
  const write = await dispatch(
    registry,
    `/_rpc/${id}/write`,
    { input: null },
    scope,
    application,
    scope.request,
    "rendering",
  );

  assert.equal(write.status, 403);
  assert.equal(runs, 0);
  assert.deepEqual(await call(registry, { mode: "rendering", scope }), {
    status: 200,
    body: "read",
  });
  assert.equal(runs, 2);
});

// Fails instead of hanging when `promise` doesn't settle in time, such as a handler that
// never starts or a signal that never aborts.
async function within(promise, what) {
  const deadline = 5000;
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} didn't settle within ${deadline} ms`)),
      deadline,
    );
  });

  try {
    return await Promise.race([promise, expired]);
  } finally {
    clearTimeout(timer);
  }
}

// A handler that settles only when its signal aborts, reporting when it started.
function abortable() {
  let started;
  const running = new Promise((resolve) => {
    started = resolve;
  });
  const seen = [];
  const registry = group(
    ({ query }) => ({
      read: query({
        handler: ({ signal }) => {
          seen.push(signal);
          started();

          return new Promise((resolve) => {
            signal.addEventListener("abort", () => resolve(`aborted: ${signal.reason.name}`), {
              once: true,
            });
          });
        },
      }),
    }),
    [
      middleware(async ({ signal, next }) => {
        seen.push(signal);

        return next();
      }),
    ],
  );

  return { registry, running, seen };
}

test("over HTTP, middleware and handlers get a signal that aborts with the incoming request", async () => {
  const { registry, running, seen } = abortable();
  const controller = new AbortController();
  const pending = handleRpc(
    registry,
    application,
    new Request(`http://test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://test" },
      body: '{"input":null}',
      signal: controller.signal,
    }),
    { allowedHosts: ["test"] },
  );

  try {
    await within(running, "the handler's start");
    assert.equal(seen[0], seen[1]);
    assert.equal(seen[0].aborted, false);
    controller.abort();

    const response = await within(pending, "the aborted call");

    assert.equal(response.status, 200);
    assert.equal(await response.json(), "aborted: AbortError");
  } finally {
    controller.abort();
  }
});

test("during server rendering, the signal aborts when HttpClient unsubscribes or the page request aborts", async () => {
  for (const cause of ["unsubscribe", "page"]) {
    const { registry, running, seen } = abortable();
    const controller = new AbortController();
    const scope = await createRequestScope(
      application,
      new Request("http://test/todos", { signal: controller.signal }),
    );
    const parent = createEnvironmentInjector([]);
    const injector = createEnvironmentInjector(
      [
        { provide: REQUEST_CONTEXT, useValue: scope },
        { provide: REQUEST, useValue: scope.request },
        {
          provide: FetchBackend,
          useValue: {
            handle: () => {
              throw new Error("RPC must not fall back");
            },
          },
        },
        provideLaunchServer(registry, application),
      ],
      parent,
    );

    try {
      const backend = injector.get(HttpBackend);
      const events = [];
      const subscription = backend
        .handle(new HttpRequest("POST", path, { input: null }))
        .subscribe({ next: (event) => events.push(event), error: (error) => events.push(error) });

      await within(running, "the handler's start");
      assert.equal(seen[0], seen[1]);
      assert.equal(seen[0].aborted, false);

      if (cause === "unsubscribe") {
        subscription.unsubscribe();
        assert.equal(seen[0].aborted, true, cause);
        assert.equal(seen[0].reason.name, "AbortError");
        // The page request itself stays live for the rest of the render.
        assert.equal(scope.request.signal.aborted, false);
        assert.deepEqual(events, []);
      } else {
        controller.abort();
        assert.equal(seen[0].aborted, true, cause);
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(events.length, 1);
        assert.equal(events[0].body, "aborted: AbortError");
      }
    } finally {
      controller.abort();
      injector.destroy();
      parent.destroy();
    }
  }
});
