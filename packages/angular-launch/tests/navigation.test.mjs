// rpcNavigationErrors' not-found recovery, against a stand-in for the router's restore hook:
// the handler's branches, and server renders through Launch's real binding, rendering backend and
// stages, where a stage keeps its refusal for the whole render. The whole flow, with the real
// hook, generated routes and both builds, is examples/angular-launch's verify.
import "@angular/compiler";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mock, test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  REQUEST,
  REQUEST_CONTEXT,
  RESPONSE_INIT,
  createEnvironmentInjector,
  runInInjectionContext,
} from "@angular/core";
import {
  APP_BASE_HREF,
  Location,
  LocationStrategy,
  PathLocationStrategy,
  PlatformLocation,
} from "@angular/common";
import { MOCK_PLATFORM_LOCATION_CONFIG, MockPlatformLocation } from "@angular/common/testing";
import { DefaultUrlSerializer, Router } from "@angular/router";

let restore;
let asked = 0;

mock.module("@loozo/angular-router/_generated", {
  exports: {
    currentSearchRestore() {
      asked += 1;

      return restore;
    },
  },
});

const { RpcNotFound, RpcRedirect, rpcNavigationErrors, searchCookies } =
  await import("../dist/index.js");
const { notFound, readCookies } = await import("../dist/server/index.js");
const { createRequestScope, provideLaunchServer } = await import("../dist/server/generated.js");
const { injectClient } = await import("../dist/remote-client.js");
// Imported after the mock, as the fixture imports this package's root.
const { application } = await import("./fixtures/application.mjs");
const serializer = new DefaultUrlSerializer();

// Runs the handler for a navigation to `url` that failed with `cause`. With `request`, as on
// the server: the page request's URL, with the server's location at `platform` and the app
// under `baseHref`.
function handle(
  cause,
  { url = "/todos?filter=50&origin=kept", state, request, platform = request, baseHref = "/" } = {},
) {
  const response = { status: 200 };
  const router = {
    parseUrl: (text) => serializer.parse(text),
    currentNavigation: () => ({ extras: { state } }),
  };
  const server = [];

  if (request !== undefined) {
    server.push(
      { provide: REQUEST, useValue: new Request(request) },
      { provide: MOCK_PLATFORM_LOCATION_CONFIG, useValue: { startUrl: platform } },
      { provide: PlatformLocation, useClass: MockPlatformLocation },
      { provide: APP_BASE_HREF, useValue: baseHref },
      { provide: LocationStrategy, useClass: PathLocationStrategy },
      { provide: Location, useClass: Location },
    );
  }

  const injector = createEnvironmentInjector(
    [
      { provide: Router, useValue: router },
      { provide: RESPONSE_INIT, useValue: response },
      ...server,
    ],
    createEnvironmentInjector([]),
  );
  const handler = rpcNavigationErrors({ notFound: "/not-found" });
  const command = runInInjectionContext(injector, () => handler({ id: 1, url, error: cause }));

  return { command, response };
}

test("a not-found after a restore forgets it and retries the original URL, without a status", () => {
  let forgotten = 0;

  restore = { originalUrl: "/todos?origin=kept", forget: () => (forgotten += 1) };
  asked = 0;

  const { command, response } = handle(new RpcNotFound(), { state: { proof: "kept" } });

  assert.equal(asked, 1);
  assert.equal(forgotten, 1);
  assert.equal(serializer.serialize(command.redirectTo), "/todos?origin=kept");
  assert.deepEqual(command.navigationBehaviorOptions, { state: { proof: "kept" } });
  assert.equal(response.status, 200);
});

test("a not-found without a restore renders not-found at the requested URL with 404", () => {
  restore = undefined;
  asked = 0;

  const { command, response } = handle(new RpcNotFound());

  assert.equal(asked, 1);
  assert.equal(serializer.serialize(command.redirectTo), "/not-found");
  assert.deepEqual(command.navigationBehaviorOptions, {
    browserUrl: "/todos?filter=50&origin=kept",
  });
  assert.equal(response.status, 404);
});

test("on the server, a not-found at the requested URL writes nothing, so the URL stays as requested", () => {
  restore = undefined;

  const { command, response } = handle(new RpcNotFound(), {
    url: "/todo/missing?x=1",
    request: "http://test/todo/m%69ssing/?x=1",
  });

  assert.equal(serializer.serialize(command.redirectTo), "/not-found");
  assert.deepEqual(command.navigationBehaviorOptions, { skipLocationChange: true });
  assert.equal(response.status, 404);
});

test("on the server, a not-found after a redirect that skipped the location change writes nothing", () => {
  restore = undefined;

  // A guard redirected /hidden/m%69ssing to /todo/missing with skipLocationChange, so the
  // server's location is still the request. Writing the canonical URL there would differ from
  // the raw request Angular compares behind a trusted X-Forwarded-Prefix.
  const { command, response } = handle(new RpcNotFound(), {
    url: "/todo/missing",
    request: "http://test/hidden/m%69ssing",
  });

  assert.equal(serializer.serialize(command.redirectTo), "/not-found");
  assert.deepEqual(command.navigationBehaviorOptions, { skipLocationChange: true });
  assert.equal(response.status, 404);
});

test("on the server, a not-found after a redirect moved the URL writes the requested URL back", () => {
  restore = undefined;

  const { command, response } = handle(new RpcNotFound(), {
    url: "/todo/missing",
    request: "http://test/app/moved/missing?x=1",
    platform: "http://test/app/todo/missing",
    baseHref: "/app/",
  });

  assert.equal(serializer.serialize(command.redirectTo), "/not-found");
  // Without the base href, which the router adds back when it writes; and overriding a skip
  // inherited from a guard's redirect.
  assert.deepEqual(command.navigationBehaviorOptions, {
    browserUrl: "/moved/missing?x=1",
    skipLocationChange: false,
  });
  assert.equal(response.status, 404);
});

test("on the server, a not-found after a redirect that only added a fragment writes the requested URL back", () => {
  restore = undefined;

  // An eager URL update wrote the guard's #details; Angular's server compares the hash too.
  const { command } = handle(new RpcNotFound(), {
    url: "/todo/missing#details",
    request: "http://test/todo/missing",
    platform: "http://test/todo/missing#details",
  });

  assert.deepEqual(command.navigationBehaviorOptions, {
    browserUrl: "/todo/missing",
    skipLocationChange: false,
  });
});

test("a redirect, or any other error, never asks for the restore", () => {
  restore = { originalUrl: "/todos", forget: () => assert.fail("forgot on a redirect") };
  asked = 0;

  const redirected = handle(new RpcRedirect("/sign-in"));

  assert.equal(serializer.serialize(redirected.command.redirectTo), "/sign-in");
  assert.equal(redirected.response.status, 200);
  assert.equal(handle(new Error("other")).command, undefined);
  assert.equal(asked, 0);
});

// The fixture's filters: "gone" was one, and no longer exists.
const filterSchema = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value) => {
      if (typeof value?.filter !== "string") {
        return { issues: [{ message: "Expected a filter" }] };
      }

      return { value: { filter: value.filter } };
    },
  },
};
const calls = [];
const filtered = application("launch-recovery-test-app", {
  // The control: a stage that refuses a filter it reads from the request.
  context: ({ request }) => {
    const refused = readCookies(request).get("search.stage.filter") === "gone";

    calls.push(`stage ${refused ? "refused" : "passed"}`);

    if (refused) {
      throw notFound();
    }

    return {};
  },
  namespaces: {
    todos: {
      build: ({ query }) => ({
        // The recommended form: the remembered filter is the handler's validated input.
        read: query({
          input: filterSchema,
          handler: ({ input, response }) => {
            calls.push(`handler ${input.filter}`);
            response.setCookie("proof-own", "1");

            if (input.filter === "gone") {
              throw notFound();
            }

            return { filter: input.filter };
          },
        }),
      }),
    },
  },
});
const methods = [{ name: "read", input: true, kind: "query", errors: [] }];

// Server-renders `url` with `cookie` as if the router had restored the remembered filter into
// it from `originalUrl`: the stand-in hook offers that restore once, and its forget deletes the
// cookie as the router's would, through searchCookies. The real restore redirects inside the
// render, so its request is `originalUrl` and NavigationStart counts one more.
async function render(url, cookie, originalUrl) {
  const require = createRequire(
    new URL("../../../examples/angular-launch/package.json", import.meta.url),
  );
  const load = async (specifier) => import(pathToFileURL(require.resolve(specifier)).href);
  const { bootstrapApplication } = await load("@angular/platform-browser");
  const { renderApplication, provideServerRendering } = await load("@angular/platform-server");
  const { Component, inject, provideEnvironmentInitializer } = await load("@angular/core");
  const { Location } = await load("@angular/common");
  const { provideHttpClient } = await load("@angular/common/http");
  const angularRouter = await load("@angular/router");
  const { provideRouter, RouterOutlet, withNavigationErrorHandler, NavigationStart } =
    angularRouter;
  const scope = createRequestScope(
    filtered,
    new Request(`http://test${url}`, { headers: { cookie } }),
  );
  const response = { status: 200, headers: new Headers() };
  const result = { starts: 0 };

  restore = undefined;

  if (originalUrl !== undefined) {
    restore = {
      originalUrl,
      forget: () => {
        searchCookies()().forget("stage.filter");
        restore = undefined;
      },
    };
  }

  function page(selector, template) {
    class Page {}

    Component({ selector, template })(Page);

    return Page;
  }

  class Root {}

  Component({ selector: "recovery-root", imports: [RouterOutlet], template: "<router-outlet />" })(
    Root,
  );

  result.html = await renderApplication(
    async (context) => {
      const app = await bootstrapApplication(
        Root,
        {
          providers: [
            provideServerRendering(),
            provideHttpClient(),
            provideLaunchServer(filtered),
            // Before the initial navigation starts.
            provideEnvironmentInitializer(() => {
              inject(angularRouter.Router).events.subscribe((event) => {
                if (event instanceof NavigationStart) {
                  result.starts += 1;
                }
              });
            }),
            provideRouter(
              [
                {
                  path: "todos",
                  component: page("todos-page", "todos"),
                  resolve: {
                    todos: (route) =>
                      injectClient({ todos: { methods } }).todos.read({
                        filter: route.queryParams.filter ?? "all",
                      }),
                  },
                },
                { path: "not-found", component: page("not-found-page", "not found") },
              ],
              withNavigationErrorHandler(rpcNavigationErrors({ notFound: "/not-found" })),
            ),
          ],
        },
        context,
      );

      void app.whenStable().then(() => {
        result.path = app.injector.get(Location).path(true);
      });

      return app;
    },
    {
      document: "<recovery-root></recovery-root>",
      url: `http://test${url}`,
      allowedHosts: ["test"],
      platformProviders: [
        { provide: REQUEST, useValue: scope.request },
        { provide: REQUEST_CONTEXT, useValue: scope },
        { provide: RESPONSE_INIT, useValue: response },
      ],
    },
  );
  result.status = response.status;
  result.cookies = response.headers.getSetCookie();

  return result;
}

const deletion =
  "search.stage.filter=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Lax";
const own = "proof-own=1; Path=/; HttpOnly; Secure; SameSite=Lax";

test("a handler refusing a restored input renders the original URL with its fallback, 200", async () => {
  calls.length = 0;

  const page = await render(
    "/todos?filter=gone&origin=kept",
    "search.stage.filter=gone-elsewhere",
    "/todos?origin=kept",
  );

  assert.match(page.html, /<todos-page>todos<\/todos-page>/);
  assert.equal(page.status, 200);
  assert.equal(page.path, "/todos?origin=kept");
  assert.equal(page.starts, 2);
  assert.deepEqual(calls, ["stage passed", "handler gone", "handler all"]);
  // The retried procedure's effects repeat; nothing else is dropped.
  assert.deepEqual(page.cookies, [own, deletion, own]);
});

test("a stage refusal stays a rendered 404 for that render, and the next render answers 200", async () => {
  calls.length = 0;

  const first = await render(
    "/todos?origin=kept",
    "search.stage.filter=gone",
    "/todos?origin=kept",
  );

  assert.match(first.html, /<not-found-page>not found<\/not-found-page>/);
  assert.equal(first.status, 404);
  // Rendered at the requested URL, so Angular's server adds no Location.
  assert.equal(first.path, "/todos?origin=kept");
  // The stage ran once: the retry reused its memoized refusal. Original, retry, not-found.
  assert.deepEqual(calls, ["stage refused"]);
  assert.equal(first.starts, 3);
  assert.deepEqual(first.cookies, [deletion]);

  // The browser no longer sends the deleted cookie.
  calls.length = 0;

  const second = await render("/todos?origin=kept", "");

  assert.match(second.html, /<todos-page>todos<\/todos-page>/);
  assert.equal(second.status, 200);
  assert.deepEqual(calls, ["stage passed", "handler all"]);
});
