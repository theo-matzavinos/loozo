import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DOCUMENT,
  createEnvironmentInjector,
  runInInjectionContext,
  REQUEST,
  REQUEST_CONTEXT,
} from "@angular/core";
import {
  FetchBackend,
  HttpBackend,
  HttpClient,
  HttpErrorResponse,
  HttpRequest,
  HttpResponse,
} from "@angular/common/http";
import { Observable, firstValueFrom } from "rxjs";
import { forbidden, middleware } from "../dist/server/index.js";
import {
  createRequestScope,
  handleRpc,
  provideRenderingBackend,
  runProcedure,
} from "../dist/server/generated.js";
import { bound } from "./fixtures/application.mjs";
import { injectClient } from "../dist/remote-client.js";
import { RpcError, frameworkFailures } from "../dist/client.js";

const path = "/_rpc/commitments/save";
const application = {
  id: "input-issues-test-app",
  context: () => ({}),
};
const request = new Request("http://127.0.0.1/commitments");

// Vendor details such as codes and the received input must not reach the client.
const schemaIssues = [
  {
    message: "Amount required",
    path: ["document", "lines", 1, "amount"],
    code: "too_small",
    input: "private input",
  },
  {
    message: "Reason required",
    path: [{ key: "document" }, { key: "lines" }, { key: 0 }, "reason"],
  },
  { message: "Symbol segment", path: ["document", Symbol("private")] },
  { message: "Symbol key segment", path: [{ key: Symbol("private") }, "amount"] },
  { message: "Non-finite segment", path: ["lines", Number.NaN] },
  { message: "Whole document" },
  { message: "Empty path", path: [] },
];
const expectedIssues = [
  { path: ["document", "lines", 1, "amount"], message: "Amount required" },
  { path: ["document", "lines", 0, "reason"], message: "Reason required" },
  { path: [], message: "Symbol segment" },
  { path: [], message: "Symbol key segment" },
  { path: [], message: "Non-finite segment" },
  { path: [], message: "Whole document" },
  { path: [], message: "Empty path" },
];
const invalidFrame = {
  error: {
    code: "INVALID_INPUT",
    message: frameworkFailures.INVALID_INPUT.message,
    data: { issues: expectedIssues },
  },
};
const emptyFrame = {
  error: {
    code: "INVALID_INPUT",
    message: frameworkFailures.INVALID_INPUT.message,
    data: { issues: [] },
  },
};

function routes(calls) {
  return {
    commitments: {
      build: ({ query }) => ({
        save: query({
          input: {
            "~standard": {
              version: 1,
              vendor: "test",
              async validate(value) {
                if (value === "valid") {
                  return { value };
                }

                return { issues: schemaIssues };
              },
            },
          },
          use: [
            middleware(async ({ next }) => {
              calls.push("middleware");

              return next();
            }),
          ],
          handler: () => {
            calls.push("handler");

            return "saved";
          },
        }),
      }),
    },
  };
}

async function http(namespaces, body) {
  const response = await handleRpc(
    bound(application, namespaces),
    new Request(`http://127.0.0.1${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
      body,
    }),
    { allowedHosts: ["127.0.0.1"] },
  );

  return { status: response.status, body: await response.json() };
}

async function rendering(namespaces, callback) {
  const app = bound(application, namespaces);
  const scope = createRequestScope(app, request);
  const parent = createEnvironmentInjector([]);
  const injector = createEnvironmentInjector(
    [
      { provide: REQUEST_CONTEXT, useValue: scope },
      { provide: REQUEST, useValue: scope.request },
      { provide: DOCUMENT, useValue: { location: { href: scope.request.url } } },
      {
        provide: FetchBackend,
        useValue: {
          handle: () => {
            throw new Error("Unexpected fallback");
          },
        },
      },
      provideRenderingBackend(app),
    ],
    parent,
  );

  try {
    return await callback(injector.get(HttpBackend), scope);
  } finally {
    injector.destroy();
    parent.destroy();
  }
}

async function renderingReply(backend, httpRequest) {
  try {
    const response = await firstValueFrom(backend.handle(httpRequest));

    return { status: response.status, body: response.body };
  } catch (error) {
    assert.ok(error instanceof HttpErrorResponse);

    return { status: error.status, body: error.error };
  }
}

test("schema failures send normalized path-indexed issues before procedure middleware, identically over HTTP, rendering and direct dispatch", async () => {
  const calls = [];
  const namespaces = routes(calls);
  const expected = { status: 400, body: invalidFrame };

  await rendering(namespaces, async (backend, scope) => {
    const direct = await runProcedure(
      path,
      { input: "invalid" },
      scope,
      bound(application, namespaces),
      scope.request,
    );
    const rendered = await renderingReply(backend, new HttpRequest("POST", path, { input: "x" }));

    assert.deepEqual(direct, expected);
    assert.deepEqual(rendered, expected);
  });

  assert.deepEqual(await http(namespaces, '{"input":"invalid"}'), expected);
  assert.deepEqual(calls, []);
  assert.deepEqual(await http(namespaces, '{"input":"valid"}'), { status: 200, body: "saved" });
  assert.deepEqual(calls, ["middleware", "handler"]);
});

test("malformed envelopes and requests send INVALID_INPUT with no issues on every transport", async () => {
  const calls = [];
  const namespaces = routes(calls);
  const expected = { status: 400, body: emptyFrame };

  await rendering(namespaces, async (backend, scope) => {
    for (const envelope of [{}, [], null, { input: "x", extra: true }]) {
      assert.deepEqual(
        await runProcedure(path, envelope, scope, bound(application, namespaces), scope.request),
        expected,
      );
    }

    const valid = new HttpRequest("POST", path, { input: "valid" });

    for (const changed of [
      valid.clone({ body: "bad JSON" }),
      // JSON.parse reads an overflowing number as Infinity, which isn't strict JSON.
      valid.clone({
        body: '{"input":{"nested":[1e400]}}',
        setHeaders: { "content-type": "application/json" },
      }),
      valid.clone({ body: { input: "x", extra: true } }),
      valid.clone({ method: "PUT" }),
      valid.clone({ url: `${path}?extra=1` }),
    ]) {
      assert.deepEqual(await renderingReply(backend, changed), expected);
    }
  });

  for (const body of [
    "not JSON",
    "{}",
    '{"input":"x","extra":true}',
    '{"input":1e400}',
    '{"input":{"nested":[-1e400]}}',
  ]) {
    assert.deepEqual(await http(namespaces, body), expected);
  }

  const wrongType = await handleRpc(
    bound(application, namespaces),
    new Request(`http://127.0.0.1${path}`, {
      method: "POST",
      headers: { "content-type": "text/plain", origin: "http://127.0.0.1" },
      body: '{"input":"invalid"}',
    }),
    { allowedHosts: ["127.0.0.1"] },
  );

  assert.deepEqual({ status: wrongType.status, body: await wrongType.json() }, expected);

  const noInput = {
    commitments: {
      build: ({ query }) => ({
        save: query({ handler: () => "saved" }),
      }),
    },
  };

  assert.deepEqual(await http(noInput, '{"input":"unexpected"}'), expected);
  assert.deepEqual(calls, []);
});

test("other framework failures keep null data", async () => {
  const namespaces = {
    commitments: {
      build: ({ query }) => ({
        save: query({
          use: [
            middleware(async () => {
              throw forbidden();
            }),
          ],
          handler: () => "saved",
        }),
        fail: query({
          handler: () => {
            throw new Error("private failure");
          },
        }),
      }),
    },
  };
  const previous = console.error;

  console.error = () => {};

  try {
    assert.deepEqual((await http(namespaces, '{"input":null}')).body.error.data, null);

    for (const [target, code] of [
      ["/_rpc/commitments/absent", "RPC_NOT_FOUND"],
      ["/_rpc/commitments/fail", "INTERNAL"],
    ]) {
      const response = await handleRpc(
        bound(application, namespaces),
        new Request(`http://127.0.0.1${target}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
          body: '{"input":null}',
        }),
        { allowedHosts: ["127.0.0.1"] },
      );
      const body = await response.json();

      assert.equal(body.error.code, code);
      assert.equal(body.error.data, null);
    }
  } finally {
    console.error = previous;
  }
});

test("clients decode INVALID_INPUT issues from HTTP and rendering transports as owned RpcErrors", async () => {
  const namespaces = routes([]);
  const methods = [{ name: "save", input: true, kind: "query", errors: [] }];
  const httpTransport = new HttpClient({
    handle: (httpRequest) =>
      new Observable((subscriber) => {
        void http(namespaces, httpRequest.serializeBody()).then((reply) => {
          if (reply.status >= 400) {
            subscriber.error(new HttpErrorResponse({ status: reply.status, error: reply.body }));

            return;
          }

          subscriber.next(new HttpResponse({ status: reply.status, body: reply.body }));
          subscriber.complete();
        });
      }),
  });

  await rendering(namespaces, async (backend) => {
    for (const transport of [httpTransport, new HttpClient(backend)]) {
      const parent = createEnvironmentInjector([]);
      const injector = createEnvironmentInjector(
        [{ provide: HttpClient, useValue: transport }],
        parent,
      );

      try {
        const client = runInInjectionContext(injector, () =>
          injectClient({ commitments: { methods } }),
        );

        await assert.rejects(client.commitments.save("invalid"), (error) => {
          assert.ok(error instanceof RpcError);
          assert.equal(client.commitments.save.isError(error), true);
          assert.equal(error.code, "INVALID_INPUT");
          assert.equal(error.status, 400);
          assert.deepEqual(error.data, { issues: expectedIssues });

          return true;
        });
      } finally {
        injector.destroy();
        parent.destroy();
      }
    }
  });
});

test("clients reject INVALID_INPUT frames whose data isn't exactly issues of path and message", async () => {
  let currentFrame;
  const parent = createEnvironmentInjector([]);
  const injector = createEnvironmentInjector(
    [
      {
        provide: HttpClient,
        useValue: new HttpClient({
          handle: () =>
            new Observable((subscriber) =>
              subscriber.error(new HttpErrorResponse({ status: 400, error: currentFrame })),
            ),
        }),
      },
    ],
    parent,
  );
  const client = runInInjectionContext(injector, () =>
    injectClient({
      commitments: { methods: [{ name: "save", input: true, kind: "query", errors: [] }] },
    }),
  );
  const message = frameworkFailures.INVALID_INPUT.message;

  try {
    for (const data of [
      { issues: [] },
      { issues: [{ path: [], message: "Root" }] },
      { issues: [{ path: ["lines", 0, "amount"], message: "Amount required" }] },
    ]) {
      currentFrame = { error: { code: "INVALID_INPUT", message, data } };
      await assert.rejects(client.commitments.save("x"), (error) => {
        assert.equal(client.commitments.save.isError(error), true);
        assert.deepEqual(error.data, data);

        return true;
      });
    }

    for (const data of [
      null,
      {},
      [],
      { issues: null },
      { issues: [], extra: true },
      { issues: [null] },
      { issues: [{ path: [] }] },
      { issues: [{ message: "Root" }] },
      { issues: [{ path: [], message: 1 }] },
      { issues: [{ path: "lines", message: "Root" }] },
      { issues: [{ path: [true], message: "Root" }] },
      { issues: [{ path: [null], message: "Root" }] },
      { issues: [{ path: [["nested"]], message: "Root" }] },
      { issues: [{ path: [], message: "Root", code: "too_small" }] },
      { issues: [{ path: [], message: "Root", input: "private" }] },
    ]) {
      currentFrame = { error: { code: "INVALID_INPUT", message, data } };
      await assert.rejects(client.commitments.save("x"), (error) => {
        assert.equal(client.commitments.save.isError(error), false);
        assert.ok(error instanceof HttpErrorResponse);

        return true;
      });
    }
  } finally {
    injector.destroy();
    parent.destroy();
  }
});
