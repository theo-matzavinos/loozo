// A namespace runs its declaring route's stages and `.use()`, never the calling page's: the
// owner is fixed when the application is bound. The stage memo is per request scope, so the
// sequences below share one scope, through `runProcedure` and through the SSR backend.
import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import { DOCUMENT, REQUEST, REQUEST_CONTEXT, createEnvironmentInjector } from "@angular/core";
import { FetchBackend, HttpBackend, HttpErrorResponse, HttpRequest } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { defineRoute } from "../dist/index.js";
import { forbidden, middleware } from "../dist/server/index.js";
import {
  bindApplication,
  createRequestScope,
  handleRpc,
  provideLaunchServer,
  runProcedure,
} from "../dist/server/generated.js";

// P: `.context(sP).use(mP).remote({ session })`; C below it: `.context(sC).use(mC)
// .remote({ child })`, where sC replaces `user`. `refuse` makes sC throw `forbidden()`, and
// `failure` makes it throw that error.
function ownerFixture({ refuse = false, failure } = {}) {
  const runs = { sP: 0, sC: 0, mP: 0, mC: 0 };
  const parent = defineRoute("", {})
    .context(() => {
      runs.sP += 1;

      return { user: "parent user" };
    })
    .use(
      middleware(async ({ next }) => {
        runs.mP += 1;

        return next();
      }),
    )
    .remote(({ query }) => ({
      session: { current: query({ handler: ({ context }) => context.user }) },
    }));
  const child = defineRoute("child", { parent })
    .context(({ context }) => {
      runs.sC += 1;

      if (refuse) {
        throw forbidden();
      }

      if (failure) {
        throw failure;
      }

      return { ...context, user: "child user" };
    })
    .use(
      middleware(async ({ next }) => {
        runs.mC += 1;

        return next();
      }),
    )
    .remote(({ query }) => ({
      child: { x: query({ handler: ({ context }) => context.user }) },
    }));
  const application = bindApplication("owner-chain", [
    [parent, "src/routes/route.ts"],
    [child, "src/routes/child/route.ts"],
  ]);

  return { runs, application };
}

// Calls `procedure` (`namespace/name`) on one shared scope and resolves to its status and body.
const entryPoints = {
  runProcedure(application) {
    const scope = createRequestScope(application, new Request("http://localhost/child"));

    return {
      async call(procedure) {
        const reply = await runProcedure(
          `/_rpc/${procedure}`,
          { input: null },
          scope,
          application,
          scope.request,
        );

        return { status: reply.status, body: reply.body };
      },
      destroy() {},
    };
  },
  ssr(application) {
    const scope = createRequestScope(application, new Request("http://localhost/child"));
    const parent = createEnvironmentInjector([]);
    const injector = createEnvironmentInjector(
      [
        { provide: REQUEST_CONTEXT, useValue: scope },
        { provide: REQUEST, useValue: scope.request },
        { provide: DOCUMENT, useValue: { location: { href: scope.request.url } } },
        { provide: FetchBackend, useValue: { handle: () => assert.fail("Unexpected fallback") } },
        provideLaunchServer(application),
      ],
      parent,
    );
    const backend = injector.get(HttpBackend);

    return {
      async call(procedure) {
        const request = new HttpRequest("POST", `/_rpc/${procedure}`, { input: null });

        try {
          const response = await firstValueFrom(backend.handle(request));

          return { status: response.status, body: response.body };
        } catch (error) {
          assert.ok(error instanceof HttpErrorResponse);

          return { status: error.status, body: error.error };
        }
      },
      destroy() {
        injector.destroy();
        parent.destroy();
      },
    };
  },
};

for (const [entry, open] of Object.entries(entryPoints)) {
  test(`${entry}: an inherited namespace runs its owner's stages and middleware, in either order`, async () => {
    for (const order of [
      ["child/x", "session/current"],
      ["session/current", "child/x"],
    ]) {
      const { runs, application } = ownerFixture();
      const scope = open(application);
      const replies = {};

      try {
        for (const procedure of order) {
          replies[procedure] = await scope.call(procedure);
        }
      } finally {
        scope.destroy();
      }

      assert.deepEqual(replies["child/x"], { status: 200, body: "child user" }, order.join());
      assert.deepEqual(
        replies["session/current"],
        { status: 200, body: "parent user" },
        order.join(),
      );
      assert.deepEqual(runs, { sP: 1, sC: 1, mP: 1, mC: 1 }, order.join());
    }
  });

  test(`${entry}: a refusing child stage refuses only the child's namespace`, async () => {
    for (const order of [
      ["child/x", "session/current"],
      ["session/current", "child/x"],
    ]) {
      const { runs, application } = ownerFixture({ refuse: true });
      const scope = open(application);
      const replies = {};

      try {
        for (const procedure of order) {
          replies[procedure] = await scope.call(procedure);
        }
      } finally {
        scope.destroy();
      }

      assert.deepEqual(
        replies["child/x"],
        {
          status: 403,
          body: { error: { code: "FORBIDDEN", message: "RPC forbidden", data: null } },
        },
        order.join(),
      );
      assert.deepEqual(
        replies["session/current"],
        { status: 200, body: "parent user" },
        order.join(),
      );
      assert.deepEqual(runs, { sP: 1, sC: 1, mP: 1, mC: 0 }, order.join());
    }
  });
}

test("over HTTP each request gets a fresh scope: the refusal and the inherited call answer apart", async () => {
  const { runs, application } = ownerFixture({ refuse: true });

  async function post(procedure) {
    const response = await handleRpc(
      application,
      new Request(`http://localhost/_rpc/${procedure}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: '{"input":null}',
      }),
      { allowedHosts: ["localhost"] },
    );

    return { status: response.status, body: await response.json() };
  }

  assert.deepEqual(await post("child/x"), {
    status: 403,
    body: { error: { code: "FORBIDDEN", message: "RPC forbidden", data: null } },
  });
  assert.deepEqual(runs, { sP: 1, sC: 1, mP: 0, mC: 0 });
  assert.deepEqual(await post("session/current"), { status: 200, body: "parent user" });
  assert.deepEqual(runs, { sP: 2, sC: 1, mP: 1, mC: 0 });
});

test("a stage function shared by two routes runs once per route", async () => {
  let runs = 0;

  function shared({ context }) {
    runs += 1;

    return { ...context, depth: (context.depth ?? 0) + 1 };
  }

  const root = defineRoute("", {})
    .context(shared)
    .remote(({ query }) => ({
      outer: { depth: query({ handler: ({ context }) => context.depth }) },
    }));
  const inner = defineRoute("inner", { parent: root })
    .context(shared)
    .remote(({ query }) => ({
      inner: { depth: query({ handler: ({ context }) => context.depth }) },
    }));
  const application = bindApplication("shared-stage", [
    [root, "src/routes/route.ts"],
    [inner, "src/routes/inner/route.ts"],
  ]);
  const scope = createRequestScope(application, new Request("http://localhost/inner"));

  async function depth(procedure) {
    const reply = await runProcedure(
      `/_rpc/${procedure}`,
      { input: null },
      scope,
      application,
      scope.request,
    );

    return reply.body;
  }

  assert.equal(await depth("outer/depth"), 1);
  assert.equal(await depth("inner/depth"), 2);
  assert.equal(await depth("outer/depth"), 1);
  assert.equal(runs, 2);
});

test("a scope one copy of the package created runs its stages when another copy dispatches it", async () => {
  const creating = await import("../dist/server/dispatch.js?copy=creating");
  const dispatching = await import("../dist/server/dispatch.js?copy=dispatching");
  const { runs, application } = ownerFixture();
  const scope = creating.createRequestScope(application, new Request("http://localhost/child"));
  const reply = await dispatching.runProcedure(
    "/_rpc/child/x",
    { input: null },
    scope,
    application,
    scope.request,
  );

  assert.deepEqual([reply.status, reply.body], [200, "child user"]);
  assert.deepEqual(runs, { sP: 1, sC: 1, mP: 0, mC: 1 });

  const failure = new Error("child unreachable");
  const failing = ownerFixture({ failure });
  const failingScope = creating.createRequestScope(
    failing.application,
    new Request("http://localhost/child"),
  );
  const previous = console.error;
  let failed;

  console.error = () => {};

  try {
    failed = await dispatching.runProcedure(
      "/_rpc/child/x",
      { input: null },
      failingScope,
      failing.application,
      failingScope.request,
    );
  } finally {
    console.error = previous;
  }

  assert.equal(failed.status, 500);
  assert.equal(failed.failedStage.route, "src/routes/child/route.ts");
  assert.equal(failed.failedStage.error, failure);
});
