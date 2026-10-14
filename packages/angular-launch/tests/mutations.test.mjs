import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  Component,
  REQUEST,
  REQUEST_CONTEXT,
  createEnvironmentInjector,
  runInInjectionContext,
} from "@angular/core";
import {
  FetchBackend,
  HttpClient,
  HttpErrorResponse,
  HttpResponse,
  provideHttpClient,
  withFetch,
  withInterceptors,
} from "@angular/common/http";
import { Observable, firstValueFrom } from "rxjs";
import { defineContext, defineRpc, mutation, query } from "../dist/server/index.js";
import { createRequestScope, handleRpc, provideLaunchServer } from "../dist/server/generated.js";
import { dispatch } from "../dist/server/dispatch.js";
import { injectClient } from "../dist/generated.js";
import { RpcError, frameworkFailures } from "../dist/client.js";

const id = "c".repeat(24);
const path = `/_rpc/${id}/write`;
const application = { id: "mutation-contracts", context: defineContext(() => ({})) };
const declaration = { status: 404, message: "Todo does not exist" };

const transformed = {
  "~standard": {
    version: 1,
    vendor: "contracts",
    async validate(value) {
      if (typeof value !== "string") {
        return { issues: [{ message: "private validator detail" }] };
      }

      return { value: { id: value.trim(), length: value.trim().length } };
    },
  },
};

async function reply(registry, name = "write", input = null, mode = "http") {
  const scope = await createRequestScope(application, new Request("http://test/document"));

  return dispatch(
    registry,
    `/_rpc/${id}/${name}`,
    { input },
    scope,
    application,
    scope.request,
    mode,
  );
}

async function httpReply(registry, name = "write", input = null) {
  const request = new Request(`http://test/_rpc/${id}/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input }),
  });
  const response = await handleRpc(registry, application, request);

  return { status: response.status, body: await response.json() };
}

test("declared factories are synchronous throwables; async schema output crosses identical HTTP/direct boundaries", async () => {
  let validations = 0;
  const data = {
    "~standard": {
      ...transformed["~standard"],
      async validate(value) {
        validations += 1;

        return transformed["~standard"].validate(value);
      },
    },
  };
  let saved;
  const registry = {
    [id]: defineRpc("todos", {
      write: mutation({
        errors: { NOT_FOUND: { ...declaration, data } },
        handler: ({ errors }) => {
          const before = validations;

          saved = errors.NOT_FOUND("  todo-1  ");
          assert.ok(saved instanceof Error);
          assert.equal(validations, before);
          assert.equal(Object.hasOwn(saved, "data"), false);

          throw saved;
        },
      }),
    }),
  };
  const expected = {
    status: 404,
    body: {
      error: { code: "NOT_FOUND", message: declaration.message, data: { id: "todo-1", length: 6 } },
    },
  };

  assert.equal(validations, 0);
  assert.deepEqual(await reply(registry), expected);
  assert.equal(validations, 1);
  assert.deepEqual(await httpReply(registry), expected);
  assert.equal(validations, 2);

  // A second dispatcher module instance must read the actual procedure's map.
  const duplicate = await import(`../dist/server/dispatch.js?duplicate=${Date.now()}`);
  const scope = await createRequestScope(application, new Request("http://test/document"));

  assert.deepEqual(
    await duplicate.dispatch(registry, path, { input: null }, scope, application, scope.request),
    expected,
  );
  assert.equal(validations, 3);
  assert.equal((await reply(registry, "absent")).body.error.code, "RPC_NOT_FOUND");

  // Factory data is server-local schema input, not a wire value yet. A real
  // Standard Schema may accept Date internally while publishing JSON output.
  const timestamp = new Date("2026-01-01T00:00:00.000Z");
  const dates = {
    [id]: defineRpc("todos", {
      write: mutation({
        errors: {
          NOT_FOUND: {
            ...declaration,
            data: {
              "~standard": {
                version: 1,
                vendor: "contracts",
                async validate(value) {
                  assert.equal(value, timestamp);

                  if (!(value instanceof Date)) {
                    return { issues: [{ message: "Date required" }] };
                  }

                  return { value: { id: value.toISOString() } };
                },
              },
            },
          },
        },
        handler: ({ errors }) => {
          throw errors.NOT_FOUND(timestamp);
        },
      }),
    }),
  };
  const dated = {
    status: 404,
    body: {
      error: {
        code: "NOT_FOUND",
        message: declaration.message,
        data: { id: timestamp.toISOString() },
      },
    },
  };

  assert.deepEqual(await reply(dates), dated);
  assert.deepEqual(await httpReply(dates), dated);
});

test("current procedure identity, not code/class/lookalike, controls declared failure publication; bad schema results stay generic", async () => {
  const logged = [];
  const original = console.error;

  console.error = (...args) => logged.push(args);

  try {
    let foreign;
    const source = mutation({
      errors: { NOT_FOUND: { ...declaration, data: transformed } },
      handler: ({ errors }) => {
        foreign = errors.NOT_FOUND("private-foreign-data");

        throw foreign;
      },
    });
    const registry = { [id]: defineRpc("todos", { source }) };

    assert.equal((await reply(registry, "source")).status, 404);

    for (const thrown of [
      foreign,
      new Error("private exception"),
      new RpcError("FORBIDDEN", 403),
      { code: "NOT_FOUND", status: 404, message: declaration.message, data: "private-lookalike" },
    ]) {
      registry[id].procedures.write = mutation({
        errors: { NOT_FOUND: { ...declaration, data: transformed } },
        handler: () => {
          throw thrown;
        },
      });

      for (const result of [await reply(registry), await httpReply(registry)]) {
        assert.deepEqual(result, {
          status: 500,
          body: { error: { code: "INTERNAL", message: "Internal server error", data: null } },
        });
        assert.ok(!JSON.stringify(result).includes("private"));
      }
    }

    for (const validate of [
      async () => ({ issues: [{ message: "private vendor detail" }] }),
      async () => {
        throw new Error("private vendor throw");
      },
      async () => ({ value: new Date() }),
      async () => ({ value: { optional: undefined } }),
      async () => ({ value: NaN }),
    ]) {
      registry[id].procedures.write = mutation({
        errors: {
          NOT_FOUND: {
            ...declaration,
            data: { "~standard": { version: 1, vendor: "contracts", validate } },
          },
        },
        handler: ({ errors }) => {
          throw errors.NOT_FOUND(null);
        },
      });

      assert.equal((await reply(registry)).body.error.code, "INTERNAL");
      assert.equal((await httpReply(registry)).body.error.code, "INTERNAL");
    }

    assert.equal(logged.length, 18);
  } finally {
    console.error = original;
  }
});

test("client mutation kind/cache, legitimate framework errors and declared transformed payloads have procedure-specific ownership", async () => {
  const requests = [];
  let currentFrame = {
    error: { code: "NOT_FOUND", message: declaration.message, data: { id: "todo-1", length: 6 } },
  };
  let currentStatus = 404;
  const parent = createEnvironmentInjector([]);
  const injector = createEnvironmentInjector(
    [
      {
        provide: HttpClient,
        useValue: new HttpClient({
          handle(request) {
            requests.push(request);

            return new Observable((subscriber) =>
              subscriber.error(
                new HttpErrorResponse({
                  status: currentStatus,
                  error: currentFrame,
                }),
              ),
            );
          },
        }),
      },
    ],
    parent,
  );
  const methods = [
    {
      name: "write",
      input: true,
      kind: "mutation",
      errors: [{ code: "NOT_FOUND", ...declaration }],
    },
    {
      name: "other",
      input: false,
      kind: "mutation",
      errors: [{ code: "NOT_FOUND", ...declaration }],
    },
    { name: "read", input: false, kind: "query", errors: [] },
  ];
  const client = runInInjectionContext(injector, () =>
    injectClient({ todos: { id, methods }, otherTodos: { id: "e".repeat(24), methods } }),
  );

  try {
    assert.equal(client.todos.write.kind, "mutation");
    assert.equal(client.todos.read.kind, "query");
    await assert.rejects(client.todos.write({ id: "todo-1" }, { transferCache: true }), (error) => {
      assert.equal(client.todos.write.isError(error), true);
      assert.equal(client.todos.other.isError(error), false);
      assert.equal(client.otherTodos.write.isError(error), false);
      assert.equal(client.todos.read.isError(error), false);
      assert.equal(error.code, "NOT_FOUND");
      assert.deepEqual(error.data, { id: "todo-1", length: 6 });

      return true;
    });
    assert.equal(requests.at(-1).transferCache, false);
    assert.equal(
      client.todos.write.isError(
        new RpcError("NOT_FOUND", 404, { id: "fake" }, declaration.message),
      ),
      false,
    );

    for (const [code, frame] of Object.entries(frameworkFailures)) {
      currentFrame = { error: { code, message: frame.message, data: null } };
      currentStatus = frame.status;
      await assert.rejects(client.todos.write({ id: "todo-1" }), (error) => {
        assert.ok(client.todos.write.isError(error));
        assert.equal(client.todos.other.isError(error), false);
        assert.equal(error.code, code);
        assert.equal(error.data, null);

        return true;
      });
    }

    for (const [frame, status] of [
      [{ error: { code: "UNKNOWN", message: declaration.message, data: {} } }, 404],
      [{ error: { code: "NOT_FOUND", message: "wrong", data: {} } }, 404],
      [{ error: { code: "NOT_FOUND", message: declaration.message, data: {} } }, 409],
      [{ error: { code: "NOT_FOUND", message: declaration.message, data: new Date() } }, 404],
      [{ error: { code: "NOT_FOUND", message: declaration.message, data: undefined } }, 404],
      [{ error: { code: "NOT_FOUND", message: declaration.message, data: {}, extra: true } }, 404],
    ]) {
      currentFrame = frame;
      currentStatus = status;
      await assert.rejects(client.todos.write({ id: "todo-1" }), (error) => {
        assert.equal(client.todos.write.isError(error), false);
        assert.ok(error instanceof HttpErrorResponse);

        return true;
      });
    }

    currentFrame = { error: { code: "FORBIDDEN", message: "RPC forbidden", data: null } };
    currentStatus = 403;
    await assert.rejects(client.todos.read(), (error) => client.todos.read.isError(error));
    assert.equal(requests.at(-1).transferCache, true);
    await assert.rejects(client.todos.read({ transferCache: false }), (error) =>
      client.todos.read.isError(error),
    );
    assert.equal(requests.at(-1).transferCache, false);
  } finally {
    injector.destroy();
    parent.destroy();
  }
});

test("native SSR denies admitted registry mutations before schema/guards/handler/writes for generated and unmarked calls, even with forced cache", async () => {
  const require = createRequire(
    new URL("../../../examples/angular-launch/package.json", import.meta.url),
  );
  const { bootstrapApplication } = await import(require.resolve("@angular/platform-browser"));
  const { renderApplication, provideServerRendering } = await import(
    require.resolve("@angular/platform-server")
  );
  const counts = { contexts: 0, schemas: 0, guards: 0, handlers: 0, writes: 0, fallback: 0 };
  const binding = {
    id: "native-mutation-denial",
    context: defineContext(() => {
      counts.contexts += 1;

      return counts;
    }),
  };
  const registry = {
    [id]: defineRpc(
      "todos",
      {
        write: mutation({
          input: {
            "~standard": {
              version: 1,
              vendor: "native-test",
              validate(value) {
                counts.schemas += 1;

                return { value };
              },
            },
          },
          canActivate: [
            () => {
              counts.guards += 1;

              return true;
            },
          ],
          handler: () => {
            counts.handlers += 1;
            counts.writes += 1;

            return "written";
          },
        }),
        read: query({ handler: () => "read works" }),
      },
      {
        canActivate: [
          () => {
            counts.guards += 1;

            return true;
          },
        ],
      },
    ),
  };
  const scope = await createRequestScope(binding, new Request("http://test/document"));
  const observed = [];

  class MutationProbe {}

  Component({ selector: "mutation-probe", template: "<p>Rendering did not write</p>" })(
    MutationProbe,
  );

  const html = await renderApplication(
    async (context) => {
      const app = await bootstrapApplication(
        MutationProbe,
        {
          providers: [
            provideServerRendering(),
            provideHttpClient(
              withFetch(),
              withInterceptors([
                (request, next) => {
                  observed.push(request.transferCache);

                  return next(request.clone({ transferCache: true }));
                },
              ]),
            ),
            { provide: REQUEST, useValue: scope.request },
            { provide: REQUEST_CONTEXT, useValue: scope },
            {
              provide: FetchBackend,
              useValue: {
                handle: () => {
                  counts.fallback += 1;

                  return new Observable((subscriber) => {
                    subscriber.next(new HttpResponse({ body: "fallback" }));
                    subscriber.complete();
                  });
                },
              },
            },
            provideLaunchServer(registry, binding),
          ],
        },
        context,
      );
      const client = runInInjectionContext(app.injector, () =>
        injectClient({
          todos: { id, methods: [{ name: "write", input: true, kind: "mutation", errors: [] }] },
        }),
      );
      const http = app.injector.get(HttpClient);

      await assert.rejects(client.todos.write("input", { transferCache: true }), (error) => {
        assert.ok(client.todos.write.isError(error));
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        assert.equal(error.message, "RPC forbidden");

        return true;
      });

      // A caller can spoof helper metadata, but actual registry kind still wins.
      const spoofed = runInInjectionContext(app.injector, () =>
        injectClient({
          todos: { id, methods: [{ name: "write", input: false, kind: "query", errors: [] }] },
        }),
      );

      assert.equal(spoofed.todos.write.kind, "query");
      await assert.rejects(spoofed.todos.write(), (error) => {
        assert.ok(spoofed.todos.write.isError(error));
        assert.ok(client.todos.write.isError(error));
        assert.equal(error.code, "FORBIDDEN");
        assert.equal(error.status, 403);
        assert.equal(error.message, "RPC forbidden");

        return true;
      });
      await assert.rejects(
        firstValueFrom(http.post(path, { input: "input" }, { transferCache: true })),
        (error) => {
          assert.equal(error.status, 403);
          assert.equal(error.error.error.code, "FORBIDDEN");

          return true;
        },
      );
      assert.equal(
        (
          await dispatch(
            registry,
            path,
            { input: "input" },
            scope,
            binding,
            scope.request,
            "rendering",
          )
        ).status,
        403,
      );

      return app;
    },
    {
      document: "<mutation-probe></mutation-probe>",
      url: scope.request.url,
      allowedHosts: ["test"],
    },
  );

  assert.ok(html.includes("Rendering did not write"));
  assert.deepEqual(observed, [false, true, true]);
  assert.deepEqual(counts, {
    contexts: 1,
    schemas: 0,
    guards: 0,
    handlers: 0,
    writes: 0,
    fallback: 0,
  });

  // The very same genuine registry procedure is admitted through HTTP, not a
  // zero-write assertion caused by an unknown endpoint or an invalid method.
  const response = await handleRpc(
    registry,
    binding,
    new Request(`http://test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "input" }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(await response.json(), "written");
  assert.deepEqual(counts, {
    contexts: 2,
    schemas: 1,
    guards: 2,
    handlers: 1,
    writes: 1,
    fallback: 0,
  });
});
