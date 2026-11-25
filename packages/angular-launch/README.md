# @loozo/angular-launch

Typed server functions for Angular applications built with [`@loozo/angular-router`](../angular-router/README.md). A route declares its server behavior on its own `route.ts`: a context stage, middleware and queries, mutations, streams and channels. The route's pages and resolvers call them through a fully typed client on the route's handle.

Calls go through Angular's `HttpClient`. In the browser they're ordinary HTTP requests. During server rendering they run in-process in the current request's scope, and hydration reuses their responses through Angular's transfer cache. Errors you declare on a procedure come back typed on the client.

Use it when you want typed reads and writes between an Angular SSR app and its own server, without maintaining a separate API layer.

**Status:** pre-1.0: breaking changes come only in minor releases (see [Versions](#versions)). MIT license. It currently covers queries, mutations, streams (over server-sent events), channels (over websockets, on Node), middleware, declared errors and redirect and not-found outcomes, with optional [TanStack Query](tanstack-query/README.md) options and keys, and Angular builders that generate before `ng build` and while `ng serve` runs. There are no server-side storage adapters; remembered search keys use browser cookies through [`searchCookies()`](#remembered-search-keys). Optimistic updates and invalidation come from TanStack Query through the integration.

## Requirements

- Angular 22 with SSR: `@angular/core`, `@angular/common` and `@angular/router` `^22.0.0` and `rxjs` `^7.8.2` (the peer dependencies), plus `@angular/ssr` and `@angular/platform-server` as in the example. Tested with Angular 22.3.0.
- `@angular/build` `~22.3.0`, for the builders. The range is narrow on purpose: the application builder's options schema is Angular's own at the version Launch was built against, so an option added in a later Angular minor is rejected until Launch is rebuilt against that minor. Launch follows the router's [Angular version policy](../angular-router/README.md#angular-versions) and releases in lockstep with it.
- `@loozo/angular-router` at exactly the version Launch pins in its `peerDependencies`, as a dependency of your app. Launch generation writes the router's files too, through an internal router entry point, so the two must match; the exact peer dependency enforces that.
- TypeScript 6 with strict checking. Generation rejects a tsconfig where any of `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `strictBuiltinIteratorReturn`, `noImplicitThis` or `useUnknownInCatchVariables` is off, or where `noCheck` is on. `"strict": true` is enough unless a flag is explicitly turned off, including in an extended config. Generation never edits your tsconfig.
- A `package.json` with a `name` in the application directory. The name is part of the generated app identity.
- Optionally, `@tanstack/angular-query` `^5.0.0-rc.5` for the [TanStack Query integration](tanstack-query/README.md), and `@angular/localize` for [translated URLs](#translated-urls).

Install both packages:

```sh
pnpm add @loozo/angular-launch @loozo/angular-router@0.1.0
```

## Versions

Launch releases are numbered `0.MINOR.PATCH` until its own 1.0: a patch doesn't break the contract and a minor may. It supports the Angular minor of the router it pins (the router's [Angular versions](../angular-router/README.md#angular-versions)), so every move to a new Angular minor is a Launch minor. Generated files aren't part of the contract byte for byte, only their names, locations and what your code uses from them, so any release, a patch included, may change their contents, and a release supports only the generated files it writes itself. Launch's generation writes the router's files too, so after upgrading both, run `ng build` (or `ng serve`) once and commit what it regenerates. Until then, the check (`ng run my-app:build:check`) fails on them and says to regenerate, and `ng test` and your editor read the old ones, which the new release doesn't support. Launch's contract is its [`SPEC.md`](SPEC.md): the entry points and their types, the builder names and options, the generated files it lists and what they export, and the behavior it specifies. It doesn't cover `@loozo/angular-launch/_server`, `/_source-text` or `/_redirects`, which only generated code imports, or the wire format between client and server, so deploy the browser and server builds of one release together.

What's different for Launch is the router pin. Launch releases in lockstep with the router and pins it exactly, so every router release comes with a Launch release that pins it. A router patch brings a Launch patch, or a minor when Launch's own changes since its last release break the contract. While Launch is on `0.x`, a router minor or major always brings a Launch minor. Upgrade the two together, the router to the version Launch's `peerDependencies` names.

Each release's breaking changes, features and fixes are listed in its [GitHub release](https://github.com/theo-matzavinos/loozo/releases?q=angular-launch&expanded=true).

## How it fits together

```text
src/
└── routes/
    ├── route.ts                 defineRoute("").context(…): the per-request context
    └── +authenticated/
        ├── route.ts             a pathless route: .context(signedIn).remote(… session …)
        └── todos/
            ├── route.ts         defineRoute("todos").remote(… todos …).resolve(…)
            ├── page.ts          injectRoute().remote.todos.list()
            ├── destination.generated.ts  generated by the router: URL facts for links and createUrl
            └── route.generated.ts  generated: the browser copy, Remote and Context, injectRoute()
generated/
├── routes.generated.ts          router: routes for provideRouter, injectActiveRoute()
└── server.generated.ts          createRequestScope, handleRequest, handleUpgrade, provideServer
```

Import `defineRoute` from `@loozo/angular-launch` instead of the router in every `route.ts`. It's the router's `defineRoute` with three more steps offered first, `.context()`, `.use()` and `.remote()`, each at most once and in that order, before the router's own steps. All three run only on the server: the router writes each route's browser copy, `route.generated.ts`, without them, and Launch adds the route's procedure metadata, its `Remote` and `Context` types and `remote` on its `injectRoute()` handle. `server.generated.ts` imports the routes themselves, so the server runs the steps.

A route sees its own namespaces and its ancestors'. App code, server code included, imports a route's `destination` or its `route.generated.ts`, never its `route.ts`.

## Setup

The [todos example](../../examples/angular-launch/) is a complete app, and the snippets below are simplified from it. `db` and `sessions` stand for your own server-only modules: the example uses a test cookie instead of sessions, and its in-memory `db.todos.listForUser` also takes a test-only delay flag.

### 1. Declare the context on the root route

The root route's `.context()` stage builds the context every procedure below it starts from:

```ts
// src/routes/route.ts
import { defineRoute } from "@loozo/angular-launch";
import { db } from "../database.server";
import { sessions } from "../sessions.server";

export default defineRoute("", {}).context(async ({ request }) => ({
  db,
  user: await sessions.authenticate(request),
}));
```

A stage runs at most once per request scope, and only when a call needs it: a page render that makes no RPC runs none. Keep per-request state in the context rather than in module-level variables.

### 2. Declare procedures on a route

```ts
// src/routes/+authenticated/route.ts
import { defineRoute } from "@loozo/angular-launch";
import { redirect } from "@loozo/angular-launch/server";
import { destination as signIn } from "../sign-in/destination.generated";
import parent from "../route";

export default defineRoute("", { parent })
  .context(({ context }) => {
    if (context.user === null) {
      throw redirect(signIn, {});
    }

    return { ...context, user: context.user }; // `User | null` above, `User` below
  })
  .remote(({ query }) => ({
    session: { current: query({ handler: ({ context }) => ({ user: context.user.id }) }) },
  }));
```

```ts
// src/routes/+authenticated/todos/route.ts
import { defineRoute } from "@loozo/angular-launch";
import { idSchema, titleSchema } from "../../../todo-input.server";
import parent from "../route";

export default defineRoute("todos", { parent })
  .remote(({ query, mutation }) => ({
    todos: {
      list: query({
        handler: ({ context }) => context.db.todos.listForUser(context.user.id),
      }),
      add: mutation({
        input: titleSchema,
        handler: ({ input, context }) => context.db.todos.addForUser(context.user.id, input.title),
      }),
    },
  }))
  .resolve({ todos: ({ remote }) => remote.todos.list() });
```

The `+authenticated` stage narrows `context.user` for every procedure at or below it, and its redirect refuses them for a signed-out caller. The `todos` route's resolver calls its own procedure through `remote`; see [Calling RPCs](#calling-rpcs).

### 3. Generate

Generation runs inside two Angular builders that replace your project's `build` and `serve` builders. Both run Angular's official builders (`@angular/build:application` and `@angular/build:dev-server`) after generating, so everything else about your build stays the same. Use them instead of the router's builders, which don't accept Launch files. In `angular.json`:

```json
"build": {
  "builder": "@loozo/angular-launch:application",
  "options": {
    "tsconfig": "tsconfig.app.json",
    "scanDirectories": ["src/routes"],
    "outDirectory": "generated",
    "browser": "src/main.ts",
    "server": "src/main.server.ts",
    "ssr": { "entry": "src/server.ts" },
    "outputMode": "server",
    "tsConfig": "tsconfig.app.json"
  },
  "configurations": { "check": { "check": true } }
},
"serve": {
  "builder": "@loozo/angular-launch:serve",
  "options": { "buildTarget": "my-app:build" }
}
```

`ng build` and `ng serve` then generate first, and `ng serve` regenerates as you edit. `ng run my-app:build:check` verifies the generated files without writing them, for CI. `tsconfig` is the TypeScript config generation reads; `tsConfig` is Angular's own compilation config. They can be the same file.

Include the generated files in your app tsconfig: `"include": ["src/**/*.ts", "generated/**/*.ts"]`. See [Builders](#builders) for the builder options and [Generation](#generation) for what gets written.

### 4. Wire the browser and server apps

The browser config is ordinary Angular:

```ts
// src/config.ts
import { provideHttpClient } from "@angular/common/http";
import { provideClientHydration } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import type { ApplicationConfig } from "@angular/core";
import { routes } from "../generated/routes.generated";

export const config: ApplicationConfig = {
  providers: [provideHttpClient(), provideClientHydration(), provideRouter(routes)],
};
```

To have pages follow a procedure's [`redirect()` and `notFound()`](#redirects-and-not-found), add [`rpcNavigationErrors`](#navigating-on-outcomes) to `provideRouter`. With [translated URLs](#translated-urls), add `provideRedirectTranslation()` here too.

The server config adds the generated `provideServer()`, after `provideHttpClient()`:

```ts
// src/config.server.ts
import { mergeApplicationConfig } from "@angular/core";
import { provideServerRendering, withRoutes } from "@angular/ssr";
import { provideServer } from "../generated/server.generated";
import { config } from "./config";
import { rendering } from "./rendering";

export const serverConfig = mergeApplicationConfig(config, {
  providers: [provideServerRendering(withRoutes(rendering)), provideServer()],
});
```

Wrap the server bootstrap in `finishLaunchRendering`. If an RPC fails while Angular prerenders a page, this makes the build fail instead of producing a broken page (see [Prerendering](#prerendering)):

```ts
// src/main.server.ts
import { bootstrapApplication, type BootstrapContext } from "@angular/platform-browser";
import { finishLaunchRendering } from "@loozo/angular-launch/server";
import { App } from "./app";
import { serverConfig } from "./config.server";

export default async function bootstrap(context: BootstrapContext) {
  const app = await bootstrapApplication(App, serverConfig, context);

  return finishLaunchRendering(app);
}
```

In the server entry, let `handleRequest` answer RPC requests (it returns `null` for anything else), and render pages with a request scope from `createRequestScope`. Give `handleRequest` and Angular the same `allowedHosts` list (see [Hosts](#hosts)), and give the web request a signal that aborts when the client goes away (see [Aborted requests](#aborted-requests)). This is the Express server that Angular's SSR setup generates, with Launch added:

```ts
// src/server.ts
import { join } from "node:path";
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  createWebRequestFromNodeRequest,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";
import { createUpgradeHandler } from "@loozo/angular-launch/node";
import express from "express";
import { createRequestScope, handleRequest, handleUpgrade } from "../generated/server.generated";

const browser = join(import.meta.dirname, "../browser");
// An explicit list stops Angular reading NG_ALLOWED_HOSTS, so read it here.
const allowedHosts = (process.env["NG_ALLOWED_HOSTS"] ?? "localhost").split(",");
const angular = new AngularNodeAppEngine({ allowedHosts });
const app = express();

app.use(express.static(browser, { maxAge: "1y", index: false, redirect: false }));

app.use(async (request, response, next) => {
  try {
    // Angular's helper only aborts while the body is still arriving; abort on a closed response.
    const closed = new AbortController();

    response.once("close", () => {
      if (!response.writableFinished) {
        // Once Angular's helper has cancelled a body it was writing.
        queueMicrotask(() => closed.abort());
      }
    });

    const native = createWebRequestFromNodeRequest(request);
    const web = new Request(native, { signal: AbortSignal.any([native.signal, closed.signal]) });
    const rpc = await handleRequest(web, { allowedHosts });

    if (rpc) {
      await writeResponseToNodeResponse(rpc, response);

      return;
    }

    const scope = createRequestScope(web); // runs nothing until an RPC needs a stage
    const page = await angular.handle(scope.request, scope);

    if (!page) {
      next();

      return;
    }

    await writeResponseToNodeResponse(page, response);
  } catch (error) {
    // Angular rejects a render whose client left; there's no one to answer.
    if (response.destroyed && error instanceof DOMException && error.name === "AbortError") {
      return;
    }

    next(error);
  }
});

// Channels arrive as websocket upgrades, which Express never sees.
const upgrade = createUpgradeHandler((request) => handleUpgrade(request, { allowedHosts }));

if (isMainModule(import.meta.url)) {
  const port = process.env["PORT"] || 4000;
  const server = app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Listening on http://localhost:${port}`);
  });

  server.on("upgrade", upgrade);
}

export const reqHandler = createNodeRequestHandler(app);
```

Angular's dev server and build use the exported `reqHandler`; `listen` only runs when you start the built server yourself (see [Deploying](#deploying)). The server must serve the `browser` build output itself: Angular's engine doesn't serve script or style files. Express isn't required; see [Other server frameworks](#other-server-frameworks). The upgrade handler only matters if you define [channels](#channels); `ng serve` uses it too. See [Channels on Node](#channels-on-node).

Launch sets no limit on request size, time or connections: it reads an RPC's whole body before any stage runs. In production, limit request bodies (bytes and read time), request targets, concurrent connections and concurrent requests, open streams and channels included, in your host or a proxy in front of this server; a body-parsing middleware such as `express.json()` isn't the place, since it consumes the body `handleRequest` reads. See [Deploying](#deploying) and the [threat model](SPEC.md#threat-model).

Import `server.generated` before any module that reaches a route, as above: with [translated URLs](#translated-urls) that order is required.

Always pass `scope.request` together with `scope`, not your original request. The scope ties the render's stages to the request Angular renders; if they don't match, RPC calls during rendering fail with `INTERNAL` and a server log entry. This catches wiring mistakes only; it doesn't check your authentication.

## Declaring server behavior on routes

A route's server steps come before its router steps, each at most once, in this order:

```ts
defineRoute("todos", { parent })
  .context(stage)                 // derive this route's context from its ancestors'
  .use(...middleware)             // wrap this route's own procedures
  .remote(({ query, mutation, stream, channel }) => ({
    todos: {
      list: query({ input?, use?, errors?, handler }),
      add: mutation({ input?, use?, errors?, handler }),
      watch: stream({ input?, use?, errors?, handler }),
    },
  }))
  .resolve({ … });                // router steps follow, typed with `remote`
```

### Context stages

`.context(stage)` derives a route's context. The stage receives `{ context, request, response, signal }`: the context of the stages above it (`{}` at the first), the request scope's request and signal, and the [cookies and headers](#cookies-and-headers) of the call that first needs it. It returns the route's whole context, an object or a promise of one, which the stages and procedures below receive as it is, type included. To add to the context above, spread it: `({ context }) => ({ ...context, user })`.

- **When it runs:** at most once per request scope, and only for an RPC call whose namespace sits at or below it. A call runs the stages from the root down to the route that declared its namespace; a page render that makes no RPC runs none. Its result, failures included, is reused by every later call in the scope, such as every call in one server render.
- **Refusing:** a stage can `throw forbidden()`, `notFound()` or `redirect(destination, values)`, which answers every call that needs it with that [outcome](#redirects-and-not-found): a signed-out stage on a pathless route refuses its whole subtree. Any other exception fails those calls with `INTERNAL`, logged with the route whose stage threw.
- **Its value** can be any object type: a union, an object with optional keys or a class instance, which keeps its methods. A key above that the stage doesn't return is gone below it, and so is its type.
- **Standalone stages** type their argument with `StageArgs` from `@loozo/angular-launch/server` and the context they receive, such as the parent route's `Context` from its `route.generated.ts`:

  ```ts
  // src/auth.server.ts
  import { redirect, type StageArgs } from "@loozo/angular-launch/server";
  import type { Context } from "./routes/route.generated";
  import { destination as signIn } from "./routes/sign-in/destination.generated";

  export function signedIn({ context }: StageArgs<Context>) {
    if (context.user === null) {
      throw redirect(signIn, {});
    }

    return { ...context, user: context.user };
  }
  ```

  A stage function shared by two routes still runs once per route.

### Procedures

`.remote(build)` declares the route's procedures in namespaces. `build` receives the `query` (a read), `mutation` (a write), `stream` (a read that sends values while it runs) and `channel` (a conversation over a websocket) builders. The route and its descendants call them as `route.remote.<namespace>.<procedure>`.

The handler receives `{ context, input, errors, request, signal, response }` and returns a value or a promise; a [stream's](#streams) returns an async iterable. `context` is what the stages from the root to this route built. It can also throw a [declared error](#declared-errors) or an [outcome](#redirects-and-not-found). `request` is the request the call runs in: the RPC request over HTTP, the page request during server rendering, or a cookie-less `GET` of the page's URL while Angular [prerenders](#prerendering) it. `signal` aborts when the caller goes away; see [Calling RPCs](#calling-rpcs). `response` sets cookies and headers; see [Cookies and headers](#cookies-and-headers).

- **Namespaces and procedure names** are literal ASCII identifiers. `__proto__` is not allowed; `constructor` and `toString` are fine. A route may declare several namespaces, and each is unique across the app because it names the procedures' URLs.
- **The callback** is read without running it: an arrow function that destructures any of `query`, `mutation`, `stream` and `channel` without renaming, returning a parenthesized object literal of namespaces, each an object literal in which each procedure is a direct builder call with inline options.
- **Inputs** are [Standard Schema](https://standardschema.dev) V1 schemas, from any library or written by hand. Validation can be async and can transform the value: callers pass the schema's input type, and procedure middleware and handlers receive its output. The `input` schema must have a concrete type without `undefined` or `null` branches, though its caller input type may be a union such as `Schema<string | number, …>`. Omit `input` for a procedure without input.
- **A namespace belongs to the route that declares it.** A call runs that route's stages and `.use()` middleware, whichever page called it: the session namespace above runs the root and `+authenticated` stages even when `todos` calls it.

Availability isn't authorization: anyone who can reach your server can call any procedure, so protect every route and procedure that needs it with a stage or middleware. Route params aren't passed to procedures automatically; pass what you need as input and validate it.

### Middleware

Middleware runs around a call to refuse it or wrap the rest of it:

```ts
// src/timing.server.ts
import { middleware } from "@loozo/angular-launch/server";

export const timing = middleware(async ({ next, response }) => {
  const start = performance.now();

  try {
    return await next();
  } finally {
    response.headers.append("server-timing", `rpc;dur=${(performance.now() - start).toFixed(1)}`);
  }
});
```

List middleware in a route's `.use()` to run it for that route's own procedures, or in a procedure's `use` to run it for that procedure. Middleware used in one place can be a bare async function written in the list, which receives the route's context, and on a procedure the validated input, already typed:

```ts
defineRoute("todos", { parent }).use(async ({ context, next }) => {
  log(context.user.id); // the stages' User

  return next();
});
```

A call runs, in order:

1. the stages from the root to the route that declared the namespace;
2. that route's `.use()` middleware, with no input;
3. input validation;
4. the procedure's middleware, with the validated input;
5. the handler.

So a caller that a stage or the route's middleware refuses gets that answer even when its input is invalid, and can't probe your schemas.

- **`next()`** continues the call and resolves to the result the middleware must return. Middleware doesn't change the context: derive values in a [stage](#context-stages). A middleware must call `next` exactly once and return its result; calling it twice or returning anything else fails the call with `INTERNAL`.
- **Wrapping:** `next()` rejects when anything after it throws, declared errors included, so a middleware can time, log or run the rest of the call in a transaction that rolls back.
- **Refusing:** `throw forbidden()` fails the call with `FORBIDDEN`, and `throw notFound()` or `throw redirect(destination, values)` answer it with that [outcome](#redirects-and-not-found); a handler can throw them too. Any other exception fails the call with `INTERNAL`. Declared errors belong to handlers.
- **Needs:** a `middleware()` needs nothing unless you say so, so it fits anywhere. Pass the context it reads as a type argument, or annotate its argument with `MiddlewareArgs<Needs, Input>` to require an input shape too. Written inline, `middleware(…)` doesn't pick up the route's context type either, so write inline middleware as a bare function and keep `middleware()` for middleware you share.

  ```ts
  export const audit = middleware<{ user: User }>(async ({ context, next }) => {
    log(context.user.id);

    return next();
  });

  export const ownTodo = middleware(
    async ({ context, input, next }: MiddlewareArgs<{ user: User; db: Db }, { id: string }>) => {
      if ((await context.db.todos.findForUser(context.user.id, input.id)) === null) {
        throw forbidden();
      }

      return next();
    },
  );
  ```

  Each entry must accept the route's context, its own stage included, and the input; the error lands on the entry that doesn't, including a bare function whose annotated argument asks for more. A route's `.use()` gets no input, so a middleware that needs input only fits on a procedure.

- **Server rendering:** stages and middleware run for every call, also during server rendering, where `request` is the page request: usually a `GET` navigation with `Sec-Fetch-Site: none` or `cross-site`. Request-shaped checks, such as on the method or `Sec-Fetch-Site`, misfire there, which is why Launch's own [cross-origin check](#cross-origin-requests) isn't middleware and runs over HTTP only.
- `.use()` isn't inherited through the route tree: a child route's procedures don't run it. There's no dedupe: middleware listed in both `.use()` and a procedure runs twice.

### Cookies and headers

Stages, middleware and handlers set cookies and headers through `response`:

```ts
login: mutation({
  input: credentialsSchema,
  errors: { WRONG_CREDENTIALS: { status: 401, message: "Wrong email or password", data: nullSchema } },
  handler: async ({ input, context, response, errors }) => {
    const session = await context.sessions.signIn(input.email, input.password);

    if (session === null) {
      throw errors.WRONG_CREDENTIALS(null);
    }

    // Defaults: Path=/; HttpOnly; Secure; SameSite=Lax
    response.setCookie("session", session.token, { maxAge: 60 * 60 * 24 * 30 });

    return { user: session.userId };
  },
}),
logout: mutation({
  handler: async ({ context, response }) => {
    await context.sessions.end(context.sessionToken);
    response.deleteCookie("session");

    return null;
  },
}),
```

- **`response.setCookie(name, value, options?)`** adds a `Set-Cookie` header. Options are `path` (default `/`), `domain`, `maxAge` in whole seconds, `expires`, `httpOnly` (default `true`), `secure` (default `true`) and `sameSite` (`"lax"` by default, `"strict"` or `"none"`, which needs `secure`). Browsers keep `Secure` cookies from `http://localhost`, so the defaults work in development; a plain-HTTP deployment on another hostname needs `secure: false`. Values aren't encoded for you: encode anything outside printable ASCII, or with spaces, `"`, `,`, `;` or `\`, first. An invalid name, value or option throws a `TypeError`, which fails the call with `INTERNAL`.
- **`response.deleteCookie(name, options?)`** expires a cookie. Pass the `path`, `domain` and security options it was set with, or the browser keeps it.
- **`response.headers`** is a `Headers` object for the RPC response. Launch's own headers (`Content-Type`, `Cache-Control`, `Vary`, `X-Content-Type-Options`) replace any you set, and the status comes from the call's outcome, never from `response`. Use `setCookie` for cookies: a `Set-Cookie` header written here is dropped during server rendering like any other header.
- **Every outcome** carries them, failures included: a cookie set before a declared error, `forbidden()` or an `INTERNAL` failure is still sent. What a cookie records has usually happened by then, such as a session a middleware refreshed before the handler failed. So set a cookie after the steps that make it true, as `login` above does: a failure before that sends none.
- **During server rendering**, cookies go on the page response, including a redirect Angular answers with, and headers are dropped, since a page's headers mustn't depend on which queries it ran. Angular copies the page's headers once the app is first stable, so only calls that settle before then send their cookies: those from guards, resolvers and rendering do, while a call made later, such as one awaited in a `BEFORE_APP_SERIALIZED` hook, still runs but its cookies are lost. Hydration reuses transferred results without calling the server, so the page response is the only chance to send such a cookie. Every call in a render shares the render's request scope, whose stages read the page request's cookies, so a cookie one call sets isn't visible to later calls. A failed initial navigation, such as a resolver whose RPC fails, makes `angular.handle` return `null`, and the cookies set during that render are lost with the page. Handle the failure in the route if they matter, so the page renders and carries them.
- **When they're sent:** once the call settled, or for a [stream](#streams) once its handler returned its iterable. After that, setting a cookie throws and header changes are ignored, so a wrapping middleware such as `timing` above can add a header after `await next()` for queries and mutations, and it's ignored for streams.
- **A stage's cookies** go to the call that ran it, once per scope: the first call that needs the stage carries them, and later calls reuse the stage's result without setting them again.

A stage can refresh a session cookie. It runs once per request scope, so the refresh runs once per page render or RPC request, however many calls need it:

```ts
// src/session.server.ts
import type { StageArgs } from "@loozo/angular-launch/server";
import type { Context } from "./routes/route.generated"; // the root's sessions and token

export function session({ context, response }: StageArgs<Context>) {
  const current = context.sessions.read(context.token);

  if (current !== null && current.expiresSoon) {
    response.setCookie("session", context.sessions.extend(current), { maxAge: 60 * 60 * 24 * 30 });
  }

  return { ...context, user: current?.user ?? null };
}
```

Concurrent RPC requests from the browser each have their own scope, so each can still refresh. Your session store has to accept that, with a sliding expiry or by keeping the old token valid for a short while. That also keeps the session usable when a refreshed cookie never arrives, as after a failed render.

`readCookies(request)` from `@loozo/angular-launch/server` reads a request's cookies, such as the root's `token` the stage above reads:

```ts
// src/routes/route.ts
import { defineRoute } from "@loozo/angular-launch";
import { readCookies } from "@loozo/angular-launch/server";
import { sessions } from "../sessions.server";

export default defineRoute("", {}).context(({ request }) => ({
  sessions,
  token: readCookies(request).get("session") ?? null,
}));
```

- **It returns** a read-only `Map` of cookie values by name: `get` returns `undefined` for a cookie the request doesn't carry, and `Object.fromEntries(cookies)` gives a plain object, such as for a log. Values come as the browser sent them, without decoding, as `setCookie` doesn't encode them.
- **A repeated name** reads as its first occurrence in the header. Browsers usually send the cookie with the longer path first, such as one set for `/todos` before one set for `/`, but the header doesn't say which path or domain each came from, so don't rely on which one wins: give cookies that mustn't collide distinct names. Pairs without a name are skipped.
- **It reads the request you pass**, so during server rendering every call sees the page request's cookies, not the ones calls set earlier in the render, and a prerendered page reads none.

### JSON values

Inputs and results must be strict JSON. `Date`, `undefined`, `NaN` and `Infinity`, functions, class instances, sparse arrays and cycles are rejected, so convert them explicitly (for example, a date to an ISO string). Rendering and HTTP use the same encoding, so a value that works during SSR also works in the browser. Plain and readonly interfaces work as input and result types without index signatures, and keep their declared types on the client.

### Declared errors

Declare the errors a procedure can return, then throw them from the handler:

```ts
complete: mutation({
  input: idSchema,
  errors: {
    NOT_FOUND: { status: 404, message: "Todo does not exist", data: idSchema },
  },
  handler: async ({ input, context, errors }) => {
    const todo = await context.db.todos.completeForUser(context.user.id, input.id);

    if (todo === null) {
      throw errors.NOT_FOUND({ id: input.id });
    }

    return todo;
  },
}),
```

Each error needs an identifier code, an integer literal `status` from 400 to 599, a non-empty literal `message` and a `data` schema; use a `Schema<null>` for errors without data. The error map must be written inline. The server validates the data with the schema before sending it.

Launch itself uses four codes, which you can't declare:

| Code            | Status | When                                                                                                                        |
| --------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_INPUT` | 400    | The request is malformed, or its input failed schema validation                                                             |
| `FORBIDDEN`     | 403    | `forbidden()` was thrown, the request wasn't proven same-origin, or a mutation or stream was called during server rendering |
| `RPC_NOT_FOUND` | 404    | No such procedure                                                                                                           |
| `INTERNAL`      | 500    | Anything else: an unexpected exception, an invalid error payload, a non-JSON result                                         |

`INTERNAL` never exposes details to the client; they go to the server log. Your own `NOT_FOUND` is fine, but `__proto__` can't be an error code.

`INVALID_INPUT` has `InvalidInputData`: `{ issues }`, with one `InputIssue` of `{ path, message }` per issue the input schema found, in the schema's order. `path` holds property names and array indexes into the input, such as `["lines", 1, "amount"]`. It's `[]` for the input as a whole, and for an issue whose schema path can't be sent as JSON, such as one with a symbol key. Only messages and paths reach the client, never the received input or other details of the schema library, so write your schema messages for users. A malformed request, such as a body that isn't JSON or an envelope with extra fields, has no issues. Server rendering and HTTP send the same issues. The other three codes have `null` data.

```ts
try {
  await remote.todos.add({ title });
} catch (error) {
  if (remote.todos.add.isError(error) && error.code === "INVALID_INPUT") {
    for (const issue of error.data.issues) {
      showError(issue.path, issue.message); // ["title"], "Title must contain 1–200 characters"
    }
  }
}
```

### Redirects and not found

A page that can't be shown, because the visitor must sign in first or the thing it shows doesn't exist, is answered with an outcome from `@loozo/angular-launch/server` instead of an error code. Stages, middleware and handlers throw them:

```ts
// src/routes/+authenticated/route.ts
import { defineRoute } from "@loozo/angular-launch";
import { redirect } from "@loozo/angular-launch/server";
import { destination as signIn } from "../sign-in/destination.generated";
import parent from "../route";

// Every procedure at or below this route answers a signed-out caller with the redirect.
export default defineRoute("", { parent }).context(({ context }) => {
  if (context.user === null) {
    throw redirect(signIn, {});
  }

  return { ...context, user: context.user };
});
```

```ts
import { notFound } from "@loozo/angular-launch/server";

get: query({
  input: idSchema,
  handler: async ({ input, context }) => {
    const todo = await context.db.todos.findForUser(context.user.id, input.id);

    // Another user's todo is missing too.
    if (todo === null) {
      throw notFound();
    }

    return todo;
  },
}),
```

- **`redirect(destination, values)`** goes to `createUrl(destination, values)`, and takes the same arguments: a `destination` from a `destination.generated.ts`, and its params, search and fragment, `{}` for none. Wrong values fail to type-check, and a URL string is a type error, so only declared pages are targets: to send the visitor on afterwards, declare a search key such as `next` on the sign-in route and pass `redirect(signIn, { search: { next: createUrl(todos, {}) } })`. An external redirect, such as to an OAuth provider, is data your page acts on.
- **On the wire** a redirect is a 303 with `{ "redirect": { "to": "/sign-in" } }` and no `Location` header (with [translated URLs](#translated-urls), also its `words`), so `fetch` hands it to the client instead of following it, and not-found is a 404 with `{ "notFound": null }`. Only status 200 is a result: a handler that returns `{ redirect: { to } }` returns data.
- **On the client** the call rejects with `RpcRedirect` (with its `to`) or `RpcNotFound` from `@loozo/angular-launch`. They aren't `RpcError`s, so `isError` is false for them. Nothing navigates for you, except in a guard or resolver with [`rpcNavigationErrors`](#navigating-on-outcomes).
- **Not-found isn't `RPC_NOT_FOUND`**, which means no such procedure, and it doesn't take a declared `NOT_FOUND` code. Use `notFound()` when the page can't be shown, and a declared error when the page handles the case itself, as the example's `complete` does.

### Streams

A stream sends values while it runs, such as a list that changes or an answer that's still being written. Its handler returns an async iterable, usually written as an `async function*`:

```ts
export default defineRoute("live", { parent }).remote(({ stream }) => ({
  live: {
    watch: stream({
      handler: async function* ({ context, signal }) {
        yield* context.db.todos.watchForUser(context.user.id, signal);
      },
    }),
  },
}));
```

Write the handler as `handler: async function* (…) { … }`: generation doesn't accept method shorthand (`async *handler() { … }`). A stream takes the same `input`, `use` and `errors` options as a query. It's a read, and it doesn't run during server rendering (see [Calling streams](#calling-streams)).

- **Values** must be strict JSON, like results, and each reaches the caller as soon as it's yielded. A value that isn't ends the stream with `INTERNAL`. The handler returns nothing: returning a value is a type error.
- **Yield the current state first.** A caller that reconnects starts a new call and the handler starts over, so a stream of snapshots loses nothing across a reconnect, while a stream of changes loses those made in between.
- **Stages and middleware** run once per stream, before the handler, with one context. `next()` settles when the stream ends: it resolves when the handler finishes or the caller goes away, and rejects when the handler throws. Wrapping middleware therefore spans the whole stream; one that opens a transaction keeps it open as long as the stream runs. Nothing is checked again while the stream runs, so a handler that must notice a revoked session checks before each value.
- **Cookies and headers** are sent with the stream's response, which starts once the handler returned its iterable. Set them in a stage, in middleware before `next()`, or in a handler that isn't a generator, before it returns one: an `async function*` handler's body runs after the response started, so setting a cookie there throws and ends the stream with `INTERNAL`. See [Cookies and headers](#cookies-and-headers).
- **Failures** before the handler returns its iterable, such as a refusing stage or middleware or invalid input, are ordinary responses with their status, as for a query. After that the response has started: a declared error, an outcome or any other exception ends the stream with that error. An `async function*` handler's body only runs once the response has started, so outcomes it throws arrive as an `error` event, such as `{"status":404,"notFound":null}`.
- **Cancellation:** when the caller stops reading or goes away, the handler's `signal` aborts and the generator is asked to return, which runs its `finally` blocks once it next yields. A generator waiting on something that ignores the signal finishes that wait first, and middleware's `next()` resolves only once the generator has returned. Hosts cancel a response body when its client goes away while it's being sent, but a client that leaves earlier, while the stages or middleware still run, is noticed only through the request's signal. Keep the server entry's [abort wiring](#aborted-requests), or such a stream runs until it ends by itself.

A stream is called with a `POST` like any procedure. Its response is `text/event-stream`: one `value` event per value, then one `end` or `error` event, and a `: keep-alive` comment every 15 seconds so proxies don't close an idle connection, skipped while earlier data still waits for the client to read it. Every `data` line is strict JSON:

```text
event: value
data: [{"id":"1","title":"Review todos","completed":false}]

event: error
data: {"status":404,"error":{"code":"NOT_FOUND","message":"Todo does not exist","data":{"id":"1"}}}
```

### Channels

A channel is a stream that also listens: the caller sends messages while the handler yields values, over one websocket. Use it for a conversation, such as a chat or an editor that sends edits and gets the document back. Its options are a stream's plus a required `message` schema, and its handler also receives `messages`:

```ts
export default defineRoute("live", { parent }).remote(({ channel }) => ({
  live: {
    // The user's todos now, then again after each title the caller sends is added.
    add: channel({
      message: titleSchema,
      handler: async function* ({ context, messages }) {
        yield await context.db.todos.snapshotForUser(context.user.id);

        for await (const { title } of messages) {
          await context.db.todos.addForUser(context.user.id, title);
          yield await context.db.todos.snapshotForUser(context.user.id);
        }
      },
    }),
  },
}));
```

Everything in [Streams](#streams) applies: values are strict JSON, the handler is written `handler: async function* (…)`, yields the current state first and returns nothing, stages and middleware run once and `next()` settles when the channel ends, cookies must be set before the handler returns its iterable, and the handler's `signal` aborts and its generator is returned when the caller goes away; the stages' `signal` and `request.signal` abort with it. `input`, if any, is read once, when the channel opens; `message` follows the same concrete-type rule as `input`, and its caller input type is what the client's `send` takes. Channels don't run during server rendering: they fail with `FORBIDDEN` before any stage or middleware.

- **Messages** are validated with `message` as the handler reads them, in the order they arrived. A message that fails validation ends the call with `INVALID_INPUT` and the schema's issues, also when the handler catches the error. `messages` has one consumer: a second iterator throws. It ends when the caller closes the channel, after the messages already received, so a handler waiting on it returns normally; its `signal` aborts at the same time.
- **Flow control** keeps both sides bounded. The server sends at most 256 values the caller hasn't read, and the caller at most 32 messages the handler hasn't read; each side grants more as it reads half its window. A caller that stops reading pauses the handler at its `yield` (it returns at once if the caller then leaves), and a handler that stops reading `messages` makes the caller's `send` wait. The server also stops pulling values, and holds back its grants, while the socket buffers more than 1 MiB of unsent data, checking every 50 ms; a caller that keeps sending without reading the grants runs out of credit and is refused. Throughput is about 256 values per network round trip.
- **Failures** before the handler returns its iterable, such as a refusing stage or middleware, invalid input or a missing procedure (`RPC_NOT_FOUND`), still upgrade the socket, which receives the failure and closes, so the client sees the procedure's own error. Host, shape and [origin](#cross-origin-requests) checks happen earlier, before any stage runs, and are refused with a plain HTTP response as for any RPC; a browser doesn't expose that response, so the client sees only a `TypeError`. The server log says why.
- **Input rides in the URL** (`?input=…`), so it's limited by the server's header size: Node refuses headers over 16 KiB with 431, which the client sees as a `TypeError`. Send large data as messages.
- **Ending:** once the handler ends, the server sends the end or the error and closes. A message the caller sends while that's on its way is dropped.

A channel is a `GET /_rpc/<namespace>/<procedure>?input=<encoded strict JSON>` upgraded to a websocket by the generated `handleUpgrade`; `handleRequest` answers a channel's path with `RPC_NOT_FOUND`, and `handleUpgrade` answers any other procedure the same way. Every frame is strict JSON text:

```text
caller → server  {"message":{"title":"Buy milk"}}   one message
                 {"ready":128}                     "I've read 128 more values"
server → caller  {"value":[{"id":"1","title":"Buy milk","completed":false}]}
                 {"ready":16}                      "the handler read 16 more messages"
                 {"end":null}, or a failure such as {"status":410,"error":{"code":"GONE","message":"Gone","data":null}}
                 then the server closes with 1000
```

A binary or malformed frame, a message beyond the caller's credit, or a grant for more values than were sent ends the call with `INVALID_INPUT` without issues. Failure frames are exactly a stream's `error` event data.

## Calling RPCs

A route's handle carries its client: `injectRoute().remote` from the route's `route.generated.ts` has the route's own namespaces and its ancestors'. Call `injectRoute()` in an injection context, such as a field initializer; reading `remote` and calling it later, from an event or after an `await`, is fine:

```ts
import { Component } from "@angular/core";
import { injectRoute } from "./route.generated";

@Component({/* … */})
export default class Todos {
  readonly route = injectRoute();

  async complete(id: string): Promise<void> {
    const { todos } = this.route.remote;

    try {
      await todos.complete({ id });
      await todos.list(); // read again explicitly; nothing is invalidated for you
    } catch (error) {
      if (todos.complete.isError(error) && error.code === "NOT_FOUND") {
        const missingId: string = error.data.id;
      }
    }
  }
}
```

Every query and mutation call returns a promise; [streams](#calling-streams) return an async iterable and [channels](#calling-channels) an open channel, and both can be followed as signals with [`connect()`](#following-streams-and-channels-with-connect). Procedures with input take the input first and options second; procedures without input take only options:

```ts
await remote.todos.list();
await remote.todos.list({ signal, transferCache: false });
await remote.todos.add({ title }, { signal });
```

| Option          | Effect                                                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signal`        | Abort the HTTP request; the call rejects with an `AbortError`. The server's stages, middleware and handler see their `signal` abort, but aborting is advisory: work that ignores it finishes, and a write may already have committed. |
| `transferCache` | Queries default to `true`. Mutations only accept `false` and never use the transfer cache.                                                                                                                                            |

`isError(error)` is true only for errors returned by that exact procedure, and narrows them to its declared errors plus the four framework codes. Network failures, aborts and the [outcomes](#redirects-and-not-found) `RpcRedirect` and `RpcNotFound` are not `RpcError`s. Each callable also has a literal `kind` of `"query"`, `"mutation"`, `"stream"` or `"channel"`.

Route resolvers, guards and titles kept on a route get the same client as `remote`, which is how a page gets its data during SSR:

```ts
// src/routes/+authenticated/todos/route.ts
export default defineRoute("todos", { parent })
  .remote(/* … */)
  .resolve({ session: ({ remote }) => remote.session.current() });
```

A route copy exports its client's type as `Remote`, for example to type a result: `Awaited<ReturnType<Remote["todos"]["list"]>>` with `import type { Remote } from "./route.generated"`. It names the server's types through the route's declaration, erased, so no server code reaches the browser bundle.

A narrowed [active route](../angular-router/README.md) handle carries the same `remote`, so a shell can call the active page's procedures. Its client is built with the injector of the `injectActiveRoute()` caller, not the route's: providers a route adds, such as an `HttpClient` interceptor, reach only that route's own `injectRoute()`.

### Navigating on outcomes

`rpcNavigationErrors({ notFound })` from `@loozo/angular-launch` is a navigation error handler for Angular's `withNavigationErrorHandler`:

```ts
// src/config.ts
import { provideRouter, withNavigationErrorHandler } from "@angular/router";
import { rpcNavigationErrors } from "@loozo/angular-launch";
import { createUrl } from "@loozo/angular-router";
import { destination as notFound } from "./routes/not-found/destination.generated";

provideRouter(
  routes,
  withNavigationErrorHandler(rpcNavigationErrors({ notFound: createUrl(notFound, {}) })),
);
```

When a guard or resolver's call rejects with `RpcRedirect`, the navigation goes to its `to` instead; during server rendering Angular answers the page request with a 302 to it. When it rejects with `RpcNotFound`, the `notFound` page is rendered while the address bar keeps the requested URL; during server rendering the page is answered with status 404. Other errors are left to Angular.

- Only navigation acts on outcomes. A call from a component, a click handler or a TanStack query just rejects.
- With Angular's `withErrorBoundaries`, an outcome thrown while a page renders, such as from a resource its template reads, reaches the boundary's error component as its `error` input. `rpcNavigationErrors` never sees it, so it neither redirects nor answers 404.
- Angular takes one navigation error handler. If your app has its own, call the function `rpcNavigationErrors` returns from it, inside that handler's injection context, and return its result.
- The 404 needs the route's `RenderMode.Server`. While Angular prerenders a page, an outcome fails the build instead; see [Prerendering](#prerendering).
- When the navigation restored a [remembered search value](#remembered-search-keys), a not-found may be that value's fault, such as a filter that no longer exists. The handler then forgets the values the navigation restored and navigates again to the URL from before the restore, keeping the navigation's `state`, so the page renders with its fallbacks. It retries once: a page missing anyway gets the not-found page after the retry. A redirect keeps remembered values. The retry runs the navigation's guards, resolvers and procedures again, and in the browser each retried call is a second RPC.

### Calling streams

In a component, follow a stream with [`connect()`](#following-streams-and-channels-with-connect), which handles rendering, reconnecting on input changes and cleanup. Underneath, a stream's callable returns an async iterable instead of a promise, and takes only `signal` as an option:

```ts
for await (const todos of remote.live.watch({ signal })) {
  this.todos.set(todos);
}
```

Each iteration sends a new request; leaving the loop early or aborting `signal` closes it. Iteration:

- ends after the stream's last value;
- throws an `RpcError` that the callable's `isError` recognizes, for a framework or declared error, and an `RpcRedirect` or `RpcNotFound` for an outcome, whether the stream was refused or ended with it;
- throws an `AbortError` when `signal` aborts;
- throws a `TypeError` when the connection fails or closes before the stream ended.

Nothing reconnects for you. To reconnect, iterate again, typically after a `TypeError` and a pause; retrying doesn't help after an `RpcError`. Each reconnect is a new call in a fresh request scope, and the stream starts over from the handler's first value.

Streams use the browser's `fetch`, not `HttpClient`, so HTTP interceptors don't see them. An `HttpClient` request keeps the app from becoming stable until it completes and keeps its whole response in memory, which an open stream would do for as long as it runs. Cookies are sent as for any same-origin request.

Streams don't run during server rendering: there, iterating one fails at once with `FORBIDDEN`, before any stage or middleware runs. Render the page from a query, then follow the stream in the browser; an open stream doesn't keep the app from becoming stable.

TanStack Query options aren't generated for streams; see the [TanStack Query guide](tanstack-query/README.md#limitations).

### Calling channels

A channel's callable opens the websocket at once and returns the channel: iterate it for the handler's values and `send` messages to it. It takes only `signal` as an option:

```ts
const adding = remote.live.add({ signal });

const sending = (async () => {
  for (const title of titles) {
    await adding.send({ title }); // typed by the channel's message schema
  }
})();

for await (const todos of adding) {
  this.todos.set(todos); // typed by what the handler yields
}
```

- **Read while you send.** Each side's window fills when the other stops reading: the server stops at 256 values you haven't read, and `send` waits once 32 messages are unread on the server. So read in a loop that runs alongside your sends, as above. Awaiting a batch of sends before reading stalls for good once both windows fill: with a handler that yields once per message, `for (const title of thousandTitles) await adding.send({ title })` followed by the read loop never gets to the loop. Its sends stop after about 290: 256 values wait unread, so the handler stops at its next `yield` and reads no more messages, and the next 32 wait unread on the server. [`connect()`](#following-streams-and-channels-with-connect) always reads, so it can't stall this way.
- **`send`** resolves once the message is handed to the socket, not once the handler has it. Messages sent before the socket opens, or while the server has no room, wait in order: up to 1,024 messages, together up to 1 MiB of JSON (counted as string length, so non-ASCII text can take more bytes). A send that would pass either limit rejects at once with a `RangeError` and isn't sent; the channel and the messages already waiting carry on, and a later send that fits goes through. When nothing waits, a message of any size is accepted, so awaiting each send, as above, never hits the limit. Once handed over, at most 32 messages the handler hasn't read are in flight, so a slow network can't grow the socket's buffer past that. `send` also rejects with the channel's closing error if the channel closes first (an `AbortError` after `signal` aborts, a `TypeError` after the channel ended or the connection closed), with a `TypeError` once the channel is closed, and with a `TypeError` for a message that isn't strict JSON.
- **Iteration** works like a stream's: it ends after the handler's last value, throws the callable's own `RpcError` or an `RpcRedirect` or `RpcNotFound` for a failure, an `AbortError` when `signal` aborts and a `TypeError` when the connection closes early, the server refused the handshake or sent a malformed frame. Values that arrive before you read them are kept, up to the server's window; aborting `signal` drops the ones not read yet, also after the handler ended. Reads may overlap: each settles in order. A channel has one iterator: iterating it twice throws. Leaving the loop early, as `break` does, or aborting `signal` closes the socket, and the handler sees its `messages` end and its `signal` abort.
- **Nothing reconnects for you,** and each call is new: a new request scope, the handler's first value again.

Channels use the browser's `WebSocket`, with the URL resolved against the page as `ws:` or `wss:`, and send the page's cookies. HTTP interceptors don't see them, and an open channel doesn't keep the app from becoming stable. During server rendering a channel fails at once with `FORBIDDEN`, without connecting. TanStack Query options aren't generated for channels.

### Following streams and channels with `connect()`

A stream's or channel's callable also has `connect()`, which follows it as signals. Call it in an injection context, such as a field initializer:

```ts
@Component({
  template: `
    <ul>
      @for (todo of todos.value(); track todo.id) {
        <li>{{ todo.title }}</li>
      }
    </ul>
    @if (todos.status() === "failed") {
      <p>Lost the live list. <button (click)="todos.reconnect()">Reconnect</button></p>
    }
    <form (submit)="add($event, title)">
      <input #title required maxlength="200" />
      <button [disabled]="adding.status() !== 'open'">Add</button>
    </form>
  `,
})
export default class Live {
  readonly #route = injectRoute();
  // The server renders the resolver's list; after hydration the stream follows it.
  protected readonly todos = this.#route.remote.live.watch.connect({
    initial: () => this.#route.data().todos,
  });
  protected readonly adding = this.#route.remote.live.add.connect({ initial: () => null });

  protected async add(event: SubmitEvent, input: HTMLInputElement): Promise<void> {
    event.preventDefault();

    try {
      await this.adding.send({ title: input.value.trim() });
      input.value = "";
    } catch {
      // adding.status() and adding.error() say why.
    }
  }
}
```

The options are:

| Option    | Effect                                                                                                                                                                                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `input`   | Read reactively. A change closes the connection and opens a new one; `undefined` keeps it closed with status `"idle"`. Required for a procedure with input, returning its input. A procedure without input connects by default; a function returning `null` connects and `undefined` keeps it closed. |
| `initial` | The value until the first value arrives, read reactively until then; also what the server renders.                                                                                                                                                                                                    |
| `reduce`  | Optional. `(state, value) => state` folds each value into the state, starting from `initial()` for each new call. Without it, the state is the latest value.                                                                                                                                          |

It returns a connection:

| Member        | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`       | A signal of the state. It's kept through failures and reconnects until a value from the new call replaces it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `status`      | A signal of `"idle"` (no input, or on the server), `"connecting"`, `"open"`, `"ended"` (the handler ended) or `"failed"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `error`       | A signal of what failed it while `"failed"`: the procedure's `RpcError` (narrow it with the callable's `isError`), an `RpcRedirect` or `RpcNotFound`, a `TypeError` for a lost or refused connection, or the `Error` `reduce` threw (anything else it throws becomes an `Error` with it as `cause`); `undefined` otherwise.                                                                                                                                                                                                                                                                          |
| `reconnect()` | After `"ended"` or `"failed"`, opens a new call, starting from the handler's first value. Does nothing otherwise.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `send()`      | Channels only. Waits while connecting and for the server's room while open, and resolves once the message is handed to the socket. Rejects with a `RangeError`, leaving the connection open, when queuing it would pass 1,024 waiting messages or 1 MiB of their JSON (string length), unless none wait; with a `TypeError` while idle, ended or failed; with the same error `error()` shows when the connection fails while it waits, also when `reduce` throws; and with an `AbortError` when Launch closes the call first, for a new input, `reconnect()` or the injection context's destruction. |

On the server it never connects: `status` is `"idle"` and `value` is `initial()`. In the browser it connects after the next render. It doesn't use `HttpClient` or Angular's pending tasks, so an open connection never keeps the app from becoming stable, and destroying the injection context closes it. It reads every value as it arrives, so channel sends never stall the way they can [when you iterate yourself](#calling-channels).

- A failed connection keeps showing the last value; show `status()` or `error()` next to it so the page doesn't look current.
- Every change of `input` reconnects, without a debounce.
- The first render shows `initial()`, also after hydration, until the first value arrives.
- `reduce` runs untracked and must be pure; what it throws fails the connection.
- A `send` you don't await or catch surfaces its rejection as an unhandled rejection.

### With TanStack Query

With the `tanstackQuery` generation option, each route's handle also has `queries`, and its copy exports `Queries`: typed query and mutation options and keys for the same namespaces as `remote`, for `@tanstack/angular-query`. See the [TanStack Query guide](tanstack-query/README.md) for setup, keys, invalidation, optimistic updates and hydration.

## Server rendering and hydration

During server rendering, calls run directly on the server with the context created for that page request. Queries are stored in Angular's HTTP transfer cache, so hydration reuses the responses instead of calling the server again. After the app is stable, calls are ordinary HTTP requests, each with a fresh context. Opt a query out with `{ transferCache: false }`. Queries run through [TanStack Query](tanstack-query/README.md) opt out and are transferred by TanStack instead.

The reuse has limits, all of them Angular's transfer cache behaving as designed:

- Only successful responses transfer. A query that fails during server rendering, with a declared error or a framework code, runs again over HTTP during hydration, with a fresh context. The handler runs twice, and the browser shows whatever the second call returns.
- The cache serves calls made before the app first becomes stable. RPCs called later, for example from a `@defer` block that hydrates on interaction or when it enters the viewport, go over HTTP.
- Launch relies on your app's transfer cache settings. `withNoHttpTransferCache()`, or a `withHttpTransferCacheOptions` `filter` that rejects `/_rpc/` requests, turns reuse off without any error, and every query runs again in the browser.

Outcomes in a guard or resolver become a 302 or a 404 page with [`rpcNavigationErrors`](#navigating-on-outcomes), and both have caveats:

- A server-rendered not-found page calls the procedure again over HTTP during hydration, because only successes transfer, so its handler runs twice. A redirect doesn't: the browser follows the 302.
- After a [remembered value](#remembered-search-keys) caused a not-found, the retry with fallbacks renders in the same request: the response is 200 at the requested URL, with the cookie's deletion, and a page missing anyway still answers 404. A handler that sets a cookie and runs on both attempts sets it twice on the page.
- The retry repeats the navigation, not the request's context. A stage runs once per render and keeps its failure, so a `.context()` stage that refuses because of a remembered value it reads from the request refuses the retry too: that render answers the not-found page with 404. Hydration then calls with a fresh context, after the cookie's deletion, so the browser may show the page with its fallbacks while the status stays 404, and the next visit answers 200. Pass the remembered value to the procedure as input instead, and check it in the handler, as below.
- Any other failure of a guard or resolver during server rendering, such as `FORBIDDEN`, `INTERNAL`, a declared error, or an outcome without `rpcNavigationErrors`, fails the initial navigation. Angular then renders no page and `angular.handle` returns `null`, so your server's fallback answers, such as the example's plain 404, without the cookies calls set during the render. Handle such errors in the route if the page should show something, or throw an outcome instead.

Mutations are refused during server rendering with `FORBIDDEN`, before any stage, middleware, validation or the handler runs. Rendering should only read. Streams are refused the same way, since they don't finish; see [Calling streams](#calling-streams).

Stages, middleware and handlers run during server rendering too, with the page request as `request`. A render's calls share one request scope, so each stage runs at most once per render. They run in the server entry's copy of your server code, the one that answers RPCs: Angular bundles the server entry apart from the server application that renders, so a module both import, such as your database client, is loaded once in each, and Launch runs a render's calls in the copy that created its request scope. A page and an RPC therefore see the same module state, such as an in-memory store or a connection pool. The other copy still evaluates the module, so whatever it starts at import time, such as a pool's connections or a timer, starts twice: create those on first use instead. While Angular [prerenders](#prerendering) a page, its calls run in the server application's copy. Their `signal` aborts when the page request aborts, or when `HttpClient` unsubscribes from the call before it settled. Cookies they set go on the page response through Angular's `RESPONSE_INIT`, and headers are dropped; see [Cookies and headers](#cookies-and-headers).

Transferred responses end up in the HTML. Only return data that the user may see, and serve personalized pages with `Cache-Control: private, no-store`.

### Remembered search keys

The router can [remember a search key](../angular-router/README.md#remembered-search-keys), such as a list's page size or filter, and bring it back when the user returns to the page. To render the remembered value on the server, keep it in cookies with `searchCookies()`:

```ts
// src/config.ts (shared by the browser and server apps)
import { rpcNavigationErrors, searchCookies } from "@loozo/angular-launch";
import { provideSearchStorage, routes } from "../generated/routes.generated";

providers: [
  provideRouter(
    routes,
    withNavigationErrorHandler(rpcNavigationErrors({ notFound: createUrl(notFound, {}) })),
  ),
  provideClientHydration(),
  provideSearchStorage(searchCookies()),
];
```

Opening `/todos` with a remembered filter answers `302` to `/todos?filter=…`, and the page renders it on the server and through hydration. Each remembered id is one cookie, `search.<id>`, with `Path=/`, a one-year `Max-Age`, `SameSite=Lax` and `Secure`, sent with every request to your origin. They have no `HttpOnly`, because the browser reads them too, so page scripts can read them: don't remember secrets. `searchCookies({ prefix, maxAge, secure })` changes the name's prefix, the lifetime, and `Secure`, which browsers accept from `http://localhost`; set `secure: false` for plain HTTP elsewhere.

During server rendering, a write goes on the page response next to the cookies your procedures set, and only when the value changes, so pages that change nothing send no `Set-Cookie`. A page that uses a remembered value gets `Vary: Cookie`, on its redirect too, so a shared cache doesn't serve one visitor's page to another; if your cache ignores `Vary`, send `Cache-Control: private` for those pages. Stages and handlers still read the page request's cookies, not what the render wrote. A value whose cookie would pass 4,096 bytes isn't stored, its old value is forgotten, and development builds warn. Prerendered pages have no request, so they render the fallback, and the browser restores after hydration.

A remembered value can stop working, such as a filter that was removed since. Pass it to your procedure as input, and throw `notFound()` from the handler when it no longer exists, as the [example](../../examples/angular-launch/)'s todos page does:

```ts
// src/routes/+authenticated/todos/route.ts (excerpt)
export default defineRoute("todos", {
  parent,
  search: { filter: remembered(withFallback(stringParam, "all"), "todos.filter") },
})
  .remote(({ query }) => ({
    todos: {
      filter: query({
        input: filterSchema,
        handler: ({ input }) => {
          const label = filters.get(input.filter);

          if (label === undefined) {
            throw notFound();
          }

          return { name: input.filter, label };
        },
      }),
    },
  }))
  .resolve({ filter: ({ remote, search }) => remote.todos.filter({ filter: search.filter }) })
  // The resolver reads search, so it runs again when only the search changes.
  .runGuardsAndResolvers("paramsOrQueryParamsChange");
```

[`rpcNavigationErrors`](#navigating-on-outcomes) then forgets the value and renders `/todos` with the fallback in the same request, answering 200 with the cookie's deletion. A check in a `.context()` stage doesn't recover that way, since a stage keeps its failure for the whole render ([Server rendering and hydration](#server-rendering-and-hydration)).

### Prerendering

A page Angular prerenders at build time can call queries:

```ts
// src/rendering.ts
export const rendering: ServerRoute[] = [
  { path: "about", renderMode: RenderMode.Prerender },
  { path: "**", renderMode: RenderMode.Server },
];
```

Angular prerenders without a request, so Launch creates the page's request scope from a cookie-less `GET` of the page's URL, and every call in that render shares it. A prerendered page shows what an anonymous visitor would see: a stage or middleware that needs a signed-in user refuses, and that fails the build.

Every call made while prerendering must succeed. With [`finishLaunchRendering`](#4-wire-the-browser-and-server-apps) in place, the build fails and names the call when one answers with anything but a result: a declared error, a framework code (such as `FORBIDDEN` from a stage or middleware, or for a mutation or stream), `notFound()` or `redirect()`. It also fails when a call sets a cookie, since a prerendered page is a file with no response to carry it, and when a context stage throws: the error names the stage's route and has the stage's error as its `cause`. Without it, Angular can write the page with the failure rendered into it, or skip the page and still report success.

Launch checks once the app is first stable, which covers calls from guards, resolvers and rendering. That's the last point where a render can still fail: Angular runs `BEFORE_APP_SERIALIZED` hooks afterwards and only logs their errors. So a call made later, such as one awaited in such a hook, isn't checked, and the page is written whether it fails or sets a cookie. Don't make Launch calls there.

The results reach the browser inside the page, as during server rendering: through Angular's transfer cache, or TanStack's hydration. Loading the page makes no RPC. Every call after that, such as a refetch, an invalidation or a client-side navigation to the page, is an ordinary HTTP request to your server, with the visitor's own request scope. So:

- Queries on a prerendered page should answer the same for everyone. One that reads the user shows the anonymous answer in the HTML, then the visitor's after its next call.
- Everything a prerendered call returns is in a file served to every visitor.
- The app still needs its server. A static deployment (`outputMode: "static"`) can't answer `/_rpc/`, so there, a client-side navigation to a prerendered page that calls an RPC fails.
- Context stages run at build time, at most once per prerendered page, in Angular's prerender workers, so whatever they use, such as a database, must be reachable from the build. The request's URL has the page's path on a local origin Angular picks, such as `http://localhost:<port>`; don't build absolute links from it.
- `ng serve` renders prerendered routes on every request the same way, anonymously whatever cookies the browser sends.
- With [translated URLs](#translated-urls), prerendered calls run in that locale's server app, so `createUrl` in a procedure returns the locale's words there, unlike on a live server.
- Angular's prerender timeout doesn't reach handlers: their `signal` aborts when the render's application is destroyed, or when `HttpClient` unsubscribes from the call.

Blocking initial navigation (`withEnabledBlockingInitialNavigation`) works with `finishLaunchRendering`. With it, Angular also runs the initial navigation to `/` while it discovers your routes at build time, so resolvers on the routes that match `/`, such as the root route's, make their calls then, once, with the anonymous context. A call refused there, such as one that needs a signed-in user, doesn't fail the build: Angular logs the error and still finds every route. Pages you prerender still fail the build for it, as above, and server-rendered pages make the call again with each visitor's context. Angular documents blocking initial navigation for server rendering without hydration, and Launch apps hydrate: hydration is what enables the HTTP transfer cache.

## Translated URLs

The router can [translate static URL segments](../angular-router/README.md#translated-urls) per Angular localize build, so the German build serves `/de/anmelden` where the source build serves `/en/sign-in`. A Launch app turns it on in its application builder, and Launch then also puts every RPC redirect in the page's language: a German visitor sent to sign in lands on `/de/anmelden`, whether the redirect reaches them through a call in the browser or as the 302 that answers a server-rendered page.

Set it up in this order:

1. Turn on `translateSegments` with Angular's `i18n`, `localize` and the `@angular/localize/init` polyfill, as the router's guide describes, and add `"types": ["@angular/localize"]` to the app tsconfig. With several locales, serve one at a time from a development configuration such as `"localize": ["de"]`: Angular's dev server doesn't localize a multi-locale `localize: true` build.

   ```jsonc
   // angular.json (excerpt)
   "i18n": { "sourceLocale": "en", "locales": { "de": "src/locale/messages.de.xlf" } },
   "build": {
     "builder": "@loozo/angular-launch:application",
     "options": {
       "translateSegments": true,
       "localize": true,
       "i18nMissingTranslation": "error",
       "polyfills": ["@angular/localize/init"]
       // …the rest as in Setup
     }
   }
   ```

2. Import `server.generated` in `server.ts` before any import that reaches a route: an authored module that imports a `destination.generated.ts` or `route.generated.ts`, directly or through other modules. The setup above already does. Angular runs no polyfills in the server entry, so `server.generated.ts` first installs a `$localize` that returns each message's source text, and any destination copy evaluated before it fails the build, or the server's start, with `ReferenceError: $localize is not defined`.

   The server entry must stay in the source language: if something else installs a `$localize` there first that translates, such as `loadTranslations` or a catalog loaded at runtime, Launch keeps it, and redirects are then built from translated words. That isn't supported. A word the page's build doesn't know stays as it is, so the German page can't match the URL; and a translated word that happens to be another route's canonical word is translated again, which reaches the wrong page: with `sign-in` → `anmelden` and a route whose canonical word is `anmelden`, a German visitor sent to sign in lands on that route's German path instead.

3. Add `provideRedirectTranslation()` from the generated `redirects.generated.ts` to the config both apps share. Generation fails until some application file imports it; it can't check that both the browser and the server app install it, so put it in `config.ts`, which `config.server.ts` merges:

   ```ts
   // src/config.ts
   import { provideRedirectTranslation } from "../generated/redirects.generated";

   export const config: ApplicationConfig = {
     providers: [
       provideHttpClient(),
       provideClientHydration(),
       provideRouter(
         routes,
         withNavigationErrorHandler(rpcNavigationErrors({ notFound: createUrl(notFound, {}) })),
       ),
       provideRedirectTranslation(),
     ],
   };
   ```

   An app that leaves it out redirects German visitors to the source-language path, which the German build can't match: navigation stays where it was, and the server answers a guarded German page as if it had no page.

Procedures don't change. `redirect(signIn, {})` builds the source-language URL on the server, whose code Angular never localizes, and the redirect frame also lists which of its path segments, counted from 0, are static words: `{ "redirect": { "to": "/sign-in", "words": [0] } }`. The page's own build, in the browser or rendering a live request, swaps those segments for its words when its generated client recognizes the frame, so `RpcRedirect.to` is `/anmelden` in the German build: exactly what `createUrl(signIn, {})` returns there. Parameter and catchall values, the search and the fragment stay as they are, as they do in that build's `createUrl`.

A destination in a [named outlet](../angular-router/README.md#named-outlets) counts its anchor's segments first, then its group's, and its outlet name is never a word, even when it's spelled like one. `redirect(item, { params: { team: "products", id: "3" } })` for `item/$id` in the `detail` outlet below `teams/$team` is `{ "to": "/teams/products/(detail:item/3)", "words": [0, 2] }`; the German build makes it `/mannschaften/products/(detail:artikel/3)`, and `/(chat:chat/7)` at the root becomes `/(chat:plaudern/7)`.

Which page a translated URL reaches is the router's: Launch's redirect equals the German link byte for byte, and generation rejects a catalog that puts one route's translated path under a catchall Angular tries first, where the source words don't ([Translated URLs](../angular-router/README.md#translated-urls)).

What stays in the source language:

- The wire frame, and what every `HttpInterceptor` sees of it, in the browser and during server rendering. With the option on, an interceptor or a test that compares redirect bodies exactly sees `words` too.
- URLs inside search values: `redirect(signIn, { search: { next: createUrl(todos, {}) } })` sends the visitor on to the source-language `next` after signing in, which the German build can't match. Pass an id instead and build the URL in the page.
- URLs a procedure returns as data, sets in a `Location` header through `response`, logs, or sends by email or webhook, and redirects your `server.ts` issues itself. While prerendering, procedures run in the localized server app, so `createUrl` there returns that locale's words: return ids and build URLs in the page.
- [`callProcedure`](#testing-handlers-stages-and-middleware) results, which never carry `words`.

A browser still running the client of a build from before the option was turned on doesn't recognize a frame with `words` and rejects with Angular's `HttpErrorResponse` until it reloads.

**Language switcher and hreflang.** The router's `localeUrls(destination, values)` and the active route's `localeUrls` signal work in a Launch app as they do with the router's own builders: Launch's application and serve builders hand the router every configured locale's base href and words, from the catalogs generation just checked, so the German sign-in page `/de/anmelden` links to `/en/sign-in`. Use the router's [switcher and hreflang snippets](../angular-router/README.md#translated-urls) as they are; its rules for which locales are listed, what's carried and when the list is empty apply unchanged. Live server rendering, prerendering and the browser all see the same list. A localized build gets it without `translateSegments` too, with your source words under each locale's base. The builders pass it as Angular's `define.loozoRouterLocales`, so that key is reserved in your own `define`, in the build and the serve options.

`ng serve` also watches the catalogs: an edit runs the router's per-locale checks again and logs a `Locale de: …` error without stopping the server. Angular's dev server applies a catalog at its next rebuild, not at the edit. A single-locale `ng serve` (`"localize": ["de"]`) gets the switcher's list with its own locale at the dev server's unprefixed base, `/anmelden`, and the list keeps the words `ng serve` started with: after an edit that changes them, it logs `Locale words changed (route.segment.guarded in de). Links from localeUrls keep the words ng serve started with until you restart it.` Restart it to refresh the list. The other locales' links point at builds this dev server doesn't serve, so check them in a production build.

## Testing

Point Angular's unit-test builder at the Launch application target, the same way `ng new` points it at the official one:

```json
"test": {
  "builder": "@angular/build:unit-test",
  "options": { "buildTarget": "app:build", "tsConfig": "tsconfig.spec.json" }
}
```

`ng test` doesn't run generation; it uses the generated files already on disk. After you add, move or remove routes or procedures, run `ng build` first, or keep `ng serve` running. `ng test` warns that the `buildTarget` uses `@loozo/angular-launch:application`, "which is not supported". The warning is expected: the unit-test builder reads the target's options, and Angular ignores Launch's own ones.

Give specs their own `tsconfig.spec.json` with `"types": ["vitest/globals"]`, and exclude `src/**/*.spec.ts` from the application tsconfig, which also keeps them out of generation's type check. With `vitest/globals`, the imports from `vitest` below are optional.

The specs below run in this package's CI against the [snippets app](snippets/), whose `todos` route has a `list` query and a `complete` mutation with a declared `NOT_FOUND`, behind a `signedIn` stage.

### Testing components and resolvers

A route's client needs only `HttpClient`: a query or mutation is a `POST /_rpc/<namespace>/<procedure>` with the body `{ "input": … }`, `null` for a procedure without input. So Angular's HTTP testing providers work, and `HttpTestingController` answers the calls. `injectRoute()` needs its route's activated record, so test a page, or a component inside one, through the router: navigate with `RouterTestingHarness` over the generated routes, answer the resolver's calls, then use the page's `route.remote` or the component it rendered:

[src/routes/todos/todo-item.spec.ts](snippets/src/routes/todos/todo-item.spec.ts)

Answer a call with what the server would send:

| Outcome         | Body                                                                                   | Status           |
| --------------- | -------------------------------------------------------------------------------------- | ---------------- |
| Result          | the result                                                                             | 200, the default |
| Declared error  | `{ error: { code, message, data } }`, with the declared `message`                      | the declared one |
| `INVALID_INPUT` | `{ error: { code: "INVALID_INPUT", message: "Invalid RPC input", data: { issues } } }` | 400              |
| `FORBIDDEN`     | `{ error: { code: "FORBIDDEN", message: "RPC forbidden", data: null } }`               | 403              |
| `RPC_NOT_FOUND` | `{ error: { code: "RPC_NOT_FOUND", message: "RPC not found", data: null } }`           | 404              |
| `INTERNAL`      | `{ error: { code: "INTERNAL", message: "Internal server error", data: null } }`        | 500              |
| `redirect()`    | `{ redirect: { to } }`, plus `words` with [translated URLs](#translated-urls)          | 303              |
| `notFound()`    | `{ notFound: null }`                                                                   | 404              |

Pass the status as `flush(body, { status, statusText })`. The client recognizes an error only when its code, status and message all match, the procedure's declaration for a declared error and the table for Launch's own codes, and its data has the shape shown. A failing status whose body is neither a recognized error nor an outcome rejects with Angular's `HttpErrorResponse`, so a mistyped message makes `isError` false without any other sign. A body flushed with a success status is a result, whatever it contains.

A resolver calls its procedure while Angular navigates. Navigate through the generated routes with `RouterTestingHarness`, as the [router's guide](../angular-router/README.md#testing-pages) shows, and answer the call while the navigation waits for it:

[src/routes/todos/route.spec.ts](snippets/src/routes/todos/route.spec.ts)

[Streams](#calling-streams) and [channels](#calling-channels) use the browser's `fetch` and `WebSocket`, not `HttpClient`, so `HttpTestingController` doesn't see them. A component that uses `route.queries` also needs the TanStack providers; see the [TanStack Query guide](tanstack-query/README.md#setup).

### Testing handlers, stages and middleware

To test a procedure, call it with `callProcedure` from `@loozo/angular-launch/testing`. Pass the authored route, the default export of its `route.ts`, one of the route's own namespaces, the procedure's name and the context your root route's stage returns. The root stage doesn't run, so what it provides, such as the user or a database client, can be a fake. The rest of the [call order](#middleware) runs as on the server: the stages below the root, the route's middleware, input validation, the procedure's middleware and the handler.

[src/routes/todos/procedures.spec.ts](snippets/src/routes/todos/procedures.spec.ts)

- The call settles to what the browser would get, the bodies in the table above with their status: `{ status: 200, result }`, `{ status, error: { code, message, data } }`, `{ status: 303, redirect: { to } }` (never with `words`, even in a [translated](#translated-urls) app: `to` is whatever `createUrl` gives in the graph the test imports) or `{ status: 404, notFound: null }`. It also has `cookies`, the `Set-Cookie` values the call set, and `headers`, the headers it set. Narrow with `"error" in call`, then by `call.error.code`, to reach a declared error's typed data. An unexpected failure is `INTERNAL`, and Launch logs it with `console.error` as the server does.
- `context`, `input` and the result are typed from the route: `context` as the root route's stage returns it (`{}` without one), so input the schema refuses needs a cast.
- Stages, middleware and the handler receive a `POST` to `http://localhost/_rpc/<namespace>/<procedure>` as their `request`. Pass `request` to give them your own, with headers or an abort signal.
- A namespace belongs to the route whose `.remote()` declares it: call an ancestor's namespace through the ancestor's route. Streams and channels can't be called this way.
- The root route is the topmost route that uses `.context()`, `.use()` or `.remote()`, normally `src/routes/route.ts`.
- Specs import `route.ts`, which application code mustn't. That's fine because the application tsconfig excludes them, as above.

`callProcedure` skips what only an HTTP request goes through: the host, origin and method checks, and the root stage. To test those too, call the generated `handleRequest` with a web `Request`, as your server does, and assert on the status and body the browser would get:

[src/routes/todos/http.spec.ts](snippets/src/routes/todos/http.spec.ts)

- Run the file in Node with `// @vitest-environment node`: it's server code. Angular's unit-test builder otherwise runs specs in a DOM emulation, happy-dom when it's installed and jsdom if not. happy-dom's `Request` drops the `Origin` header, so Launch's [cross-origin check](#cross-origin-requests) would refuse every call with `FORBIDDEN`.
- Send `Origin` with the request URL's origin, and pass a matching `allowedHosts`.
- The call uses your real stages and what they import. Angular's unit-test builder rejects `vi.mock()` for relative imports, so you can't replace a module a stage imports, such as your database client.

A standalone stage is a function of `StageArgs`, so you can test it on its own with a context you build; a middleware's `run` likewise takes the call's arguments and a `next` you watch:

[src/auth.server.spec.ts](snippets/src/auth.server.spec.ts)

`forbidden()`, `notFound()` and `redirect()` throw plain `Error`s, not types a test can check, so a test that calls a stage directly checks that it threw. To check which outcome it answered with, call a procedure behind it with `callProcedure`, as `procedures.spec.ts` above does for `FORBIDDEN`.

## Deploying

With `outputMode: "server"`, `ng build` writes the browser files and a bundled server:

```text
dist/<app>/
├── browser/            scripts, styles and index.csr.html
└── server/server.mjs   your server.ts with Angular, Launch and their dependencies
```

Copy `dist/<app>` to the host and start the server with Node:

```sh
PORT=8080 NG_ALLOWED_HOSTS=example.com node dist/<app>/server/server.mjs
```

The server bundle includes your dependencies by default, so the host doesn't need `node_modules`. The server reads two environment variables:

| Variable                 | Effect                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NG_ALLOWED_HOSTS`       | Comma-separated hostnames allowed for pages and RPCs. The server entry above reads it and passes the list to both; it defaults to `localhost` there. Other hosts get a 400.                  |
| `NG_TRUST_PROXY_HEADERS` | Read by `AngularNodeAppEngine`: comma-separated `Forwarded` and `X-Forwarded-*` headers that Angular should trust. Set it only behind a proxy that overwrites those headers. Off by default. |

Before exposing the server, limit what reaches it in the host or a proxy in front of it: request body size and read time, request target and header size, concurrent connections, and concurrent in-flight requests, open streams and channels, per client and in total. Over HTTP/2 one connection carries many requests, so a connection cap alone doesn't bound them. Launch sets none of these. It reads an RPC's whole body before any stage runs, so authentication in your stages can't stop an oversized one, and each open stream or channel holds its connection, or HTTP/2 stream, for as long as it runs. Body-parsing middleware isn't the place for the limit: it consumes the body `handleRequest` reads. The [threat model](SPEC.md#threat-model) lists what else the host and your stages own.

Launch calls `/_rpc/<namespace>/<procedure>` from the root of the domain, even when the app has a different `<base href>`. If the app is served under a path prefix, route `/_rpc/` to the same server.

Browser tabs opened before a deploy keep calling the procedures they were built with. After you rename a namespace or procedure, or change an input schema, those calls fail with `RPC_NOT_FOUND` or `INVALID_INPUT` until the page reloads. The same applies while old and new servers run side by side during a rolling deploy.

Launch has been verified on Node, and with a platform-neutral server build (below) on Deno and Cloudflare's workerd, run locally. Streams have been verified on Node, under `ng serve` and on Deno. Channels have been verified on the built Node server and under `ng serve` in Chromium, Firefox and WebKit.

### Streams behind proxies

Stream responses carry `Cache-Control: private, no-store, no-transform` and `X-Accel-Buffering: no`, which tell compression middleware that honors `no-transform` and buffering proxies such as nginx to pass them through as they're written. Go's reverse proxy, which Tailscale Serve uses, passes `text/event-stream` responses through as they're written anyway. Each open stream holds a connection: over HTTP/1.1, browsers open at most 6 per origin, so several open streams can hold up other requests. Over HTTP/2, usually with HTTPS, they share one connection.

### Channels on Node

Channels arrive as websocket upgrades, which Node hands to the HTTP server's `upgrade` listeners instead of its request handler. `createUpgradeHandler` from `@loozo/angular-launch/node` turns the generated `handleUpgrade` into such a listener. Create it once, at your server module's top level, and attach it to the server that serves the app: with Express, the server `app.listen()` returns, as in the [server entry](#4-wire-the-browser-and-server-apps); with plain Node:

```ts
// src/server.ts
import { createServer } from "node:http";
import { createUpgradeHandler } from "@loozo/angular-launch/node";
import { handleUpgrade } from "../generated/server.generated";

const upgrade = createUpgradeHandler((request) => handleUpgrade(request, { allowedHosts }));

if (isMainModule(import.meta.url)) {
  const server = createServer(reqHandler).listen(port);

  server.on("upgrade", upgrade);
}
```

Pass `handleUpgrade` the same `allowedHosts` and `origins` as `handleRequest`: it checks [hosts](#hosts) and [origins](#cross-origin-requests) the same way, before a context exists. The listener builds a web `Request` from the upgrade (the protocol from the socket, the host from `Host`; like Angular's default, it trusts no proxy headers), writes refusals to the socket as plain HTTP responses, and accepts the rest with [`ws`](https://github.com/websockets/ws), with the call's headers and cookies on the `101`. Upgrades outside `/_rpc/` are left to the server's other `upgrade` listeners. It pings each open socket every 15 seconds and drops one that doesn't answer, and closes a socket whose message is over `maxPayload` bytes with 1009, which the client sees as a `TypeError`:

```ts
createUpgradeHandler((request) => handleUpgrade(request, { allowedHosts }), {
  maxPayload: 64 * 1024, // defaults to 1 MiB
});
```

Under `ng serve`, `listen` doesn't run, so your code never attaches the listener. Launch's serve builder forwards channel upgrades to it instead: on the dev server's first request it adds one `upgrade` listener to the dev server, which passes `/_rpc/` upgrades to the latest listener `createUpgradeHandler` created and leaves every other upgrade, such as Vite's live-reload socket, to the dev server. The dev server loads your server module with the first request that reaches your server, such as a page, and again with the first such request after you edit server code; each load creates a new listener, which takes over. Rebuilding alone doesn't load it. With live reload, the default, the reload that follows a server edit is that request, so the reloaded page's channels reach the new code. With `--live-reload=false`, or for an upgrade sent before any page request since the rebuild, the previously loaded module keeps answering until a page request loads the new one. Channels already open stay on the code they started with. A channel upgrade that arrives while no listener exists, because the module hasn't loaded yet or creates none, is answered with a plain-text 503, and the dev server logs one warning naming `createUpgradeHandler`; the client sees a `TypeError`. An upgrade that arrives before the dev server has answered any request isn't forwarded, which doesn't happen in a browser, since the page loads first.

- **Memory:** an open channel holds about 1 MiB of unsent frames plus one value of any size, and 32 unread messages of up to `maxPayload` each. To keep to that, while the socket buffers 1 MiB or more the listener answers only a caller's latest ping, once the buffer drains; browsers don't ping. The final frame isn't held back, so keep the values and error data your procedures send to a size you're happy to buffer. How many channels may be open at once, and how large an upgrade request may be, is up to your host or proxy.
- **Leaving early:** a client that leaves while the context or middleware still run ends the call before its handler starts when its browser closes the connection (Chromium and WebKit do); Firefox's leaving isn't noticed until the upgrade is accepted, when the socket closes at once.
- **HTTP/2:** Node's `http2` server doesn't accept websockets over HTTP/2 (RFC 8441) by default. Browsers then open the channel over HTTP/1.1, so serve that too.
- **Other frameworks:** the listener needs the Node `upgrade` event. Express and plain Node give it as shown; Hono's `@hono/node-server` needs its own upgrade wiring, which isn't covered here.

### Hosts

`handleRequest` checks the hostname of the request URL before anything else, matching `allowedHosts` the way Angular does: exactly, `*.example.com` for subdomains only, or `*` for any host. RPCs for other hosts get a plain-text 400 `Host not allowed`, as Angular answers pages, and the hostname is logged. An empty list refuses every RPC.

Passing `allowedHosts` to `AngularNodeAppEngine` replaces its own read of `NG_ALLOWED_HOSTS`, which is why the server entry reads the variable itself. `security.allowedHosts` in `angular.json` still applies to pages only: Angular builds it into an internal manifest that `handleRequest` can't read, so list RPC hosts in the server entry. Under `ng serve`, Vite's host check covers `/_rpc/` as well.

### Cross-origin requests

`handleRequest` answers only RPCs it can prove come from the app's own origin. The rest get `FORBIDDEN` (403), logged with the reason, before a context is created:

1. An `Origin` listed in `origins` passes.
2. Otherwise, if the request has `Sec-Fetch-Site`, it must be `same-origin`. `same-site` (a sibling subdomain), `cross-site` and `none` are refused.
3. Otherwise, if it has `Origin`, that must equal the request URL's origin.
4. A request with neither header is refused. There's no `Referer` fallback and no opt-out.

Launch's browser client always sends one of the two headers. curl, scripts, Node's `fetch` and server-to-server callers send neither, so they must send `Origin` with the app's origin. Browsers send `Sec-Fetch-Site` only to HTTPS and `localhost`, so a plain-HTTP deployment on any other hostname relies on `Origin` matching the request URL. Behind a proxy that rewrites `Host`, that URL isn't the public one, and those calls are refused until you list the public origin:

```ts
const rpc = await handleRequest(web, { allowedHosts, origins: ["https://app.example.com"] });
```

List a sibling site's origin the same way to pass Launch's check. For HTTP RPCs and streams that isn't enough on its own: the browser sends a CORS preflight before the JSON `POST`, which Launch refuses, so your host must answer it and add CORS headers to responses. Channels need no CORS. Only HTTP requests are checked: calls made during server rendering carry the page request, whose `Sec-Fetch-Site` is `cross-site` or `none` on an ordinary navigation, and run without these checks.

### Other runtimes

`ng build` can also write a server bundle that doesn't depend on Node, for edge and serverless platforms: set `"platform": "neutral"` in the build target's `ssr` option, next to `entry`. Launch's server code uses only web `Request` and `Response`, so only your server entry changes:

```ts
// src/server.ts
import { AngularAppEngine, createRequestHandler } from "@angular/ssr";
import { createRequestScope, handleRequest } from "../generated/server.generated";

const allowedHosts = ["app.example.com"];
const angular = new AngularAppEngine({ allowedHosts });

export const reqHandler = createRequestHandler(async (request: Request) => {
  const rpc = await handleRequest(request, { allowedHosts });

  if (rpc) {
    return rpc;
  }

  const scope = createRequestScope(request);
  const page = await angular.handle(scope.request, scope);

  return page ?? new Response("Not found", { status: 404 });
});
```

- Import from `@angular/ssr`, not `@angular/ssr/node`. `AngularAppEngine` doesn't read `NG_ALLOWED_HOSTS` or `NG_TRUST_PROXY_HEADERS`: pass `allowedHosts`, and `trustProxyHeaders` if you're behind a proxy (it's off by default), to its constructor, and the same hosts to `handleRequest`. List them in the entry as above, or read them from your platform's configuration.
- The bundle neither serves the `browser` files nor starts a server. Point your platform's static hosting at `dist/<app>/browser` and its request handler at the exported `reqHandler`.
- Nothing polyfills Node modules for you, so your stages, handlers and their dependencies must run on the platform. In-memory state lasts only as long as the platform keeps an instance alive.
- `handleUpgrade` takes a web `Request` and runs a channel on any standard `WebSocket` the platform accepts, sending `headers` on its `101` response, but it hasn't been verified on Deno or workerd, and neither has workerd's `bufferedAmount`, which the server's flow control reads.

### Aborted requests

Launch passes `request.signal` on to middleware and handlers as `signal`. Angular's `createWebRequestFromNodeRequest` gives a signal that only aborts while the request body is still arriving, so by the time an RPC handler runs, a client that disconnects no longer aborts it. That's why the server entry above links a signal that aborts when the Node response closes before it finished:

```ts
const closed = new AbortController();

response.once("close", () => {
  if (!response.writableFinished) {
    queueMicrotask(() => closed.abort());
  }
});

const native = createWebRequestFromNodeRequest(request);
const web = new Request(native, { signal: AbortSignal.any([native.signal, closed.signal]) });
```

Pass `web` to both `handleRequest` and `createRequestScope`, so page renders get the same signal. Without this wiring everything works, but query and mutation handlers never see an abort over HTTP, and a [stream](#streams) whose client left before it started runs until it ends by itself. A stream that's already being sent stops either way, since Angular's helper cancels its body when the response closes.

The abort waits a microtask because this listener runs before the one Angular's `writeResponseToNodeResponse` adds for the same `close` event later. Aborting right away fails a stream's body before Angular's helper cancels it, and the helper then logs that failure as `DOMException [AbortError]` whenever a client leaves a stream.

Angular rejects a page render whose request aborted with an `AbortError`. When the response is gone by then, nobody is left to answer, so the server entry returns instead of passing the error to `next`, which would log it. Every other error still reaches `next`:

```ts
if (response.destroyed && error instanceof DOMException && error.name === "AbortError") {
  return;
}
```

### Other server frameworks

`handleRequest` and `createRequestScope` take a web `Request`, so any framework that gives you one works. `AngularNodeAppEngine` also accepts a web `Request`. With [Hono](https://hono.dev) on Node:

```ts
// src/server.ts
import { fileURLToPath } from "node:url";
import { createRequestHandler } from "@angular/ssr";
import { AngularNodeAppEngine, isMainModule } from "@angular/ssr/node";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createRequestScope, handleRequest } from "../generated/server.generated";

const browser = fileURLToPath(new URL("../browser", import.meta.url));
// An explicit list stops Angular reading NG_ALLOWED_HOSTS, so read it here.
const allowedHosts = (process.env["NG_ALLOWED_HOSTS"] ?? "localhost").split(",");
const angular = new AngularNodeAppEngine({ allowedHosts });
const app = new Hono();

app.use("*", serveStatic({ root: browser }));

app.all("*", async (c) => {
  const rpc = await handleRequest(c.req.raw, { allowedHosts });

  if (rpc) {
    return rpc;
  }

  const scope = createRequestScope(c.req.raw);
  const page = await angular.handle(scope.request, scope);

  return page ?? c.notFound();
});

if (isMainModule(import.meta.url)) {
  const port = Number(process.env["PORT"] ?? 4000);

  serve({ fetch: app.fetch, port }, ({ port }) => {
    console.log(`Listening on http://localhost:${port}`);
  });
}

export const reqHandler = createRequestHandler(app.fetch);
```

Export the handler as `reqHandler`; Angular's dev server and build don't look for a default export. [Channels](#channels-on-node) need their own upgrade wiring with Hono, which isn't covered here. Whether `@hono/node-server` aborts `c.req.raw.signal` when a client disconnects is unverified, so don't rely on handlers seeing an abort there. Under `ng serve`, `serveStatic` logs that the `browser` directory doesn't exist. That's expected: the dev server serves those files itself.

## Generation

The [builders](#builders) run generation for you. Underneath, it's a Node function you can also call from your own tools:

```ts
generate(workspace: string, options: GenerationOptions, stopped?: () => boolean): Promise<void>;
```

| Option              | Type           | Description                                                                                                |
| ------------------- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| `tsconfig`          | `string`       | Your app tsconfig, relative to `workspace`                                                                 |
| `scanDirectories`   | `string[]`     | Exactly one route directory, relative to the tsconfig's directory                                          |
| `outDirectory`      | `string`       | Where the app-wide generated files go, relative to `workspace`                                             |
| `tanstackQuery`     | `boolean`      | Also add `route.queries`; see [TanStack Query](tanstack-query/README.md)                                   |
| `translateSegments` | `boolean`      | Translate static segments per Angular localize build; see [Translated URLs](#translated-urls)              |
| `localization`      | `Localization` | The build's `i18n` and polyfills, required with `translateSegments`; the builders read it from the project |
| `check`             | `boolean`      | Verify generated files without writing them; fails if anything is out of date                              |

`workspace` is the absolute path of the application directory (the one with its `package.json`). The tsconfig, scan directory and output directory must all be inside it. `stopped` lets a caller cancel: if it returns `true` before writing starts, nothing is written.

Generation reads your source without running it. It writes the router's files, with Launch's additions, plus its own:

| File                                    | Contents                                                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `route.generated.ts` beside each route  | The router's browser copy without the server steps, carrying the route's procedure metadata, `Remote`, `Context` and `remote` on `injectRoute()`; `Queries` and `queries` with `tanstackQuery` |
| `<outDirectory>/server.generated.ts`    | `createRequestScope`, `handleRequest`, `handleUpgrade` and `provideServer`, bound to every route with a server step                                                                            |
| `<outDirectory>/redirects.generated.ts` | With `translateSegments` only: `provideRedirectTranslation`, every static route word with the router's message for it                                                                          |

Each file carries an ownership marker comment. Generation only replaces or removes files with those exact names and markers, fails rather than overwrite an unmarked file or a symlink in their place, and removes stale ones, including the `rpc.generated.ts` and `context.generated.d.ts` files an earlier Launch version wrote. Unchanged files aren't rewritten. Everything is validated before anything is written, so a run that fails validation changes nothing. Files are then written one at a time, with no rollback: a write error partway through, such as an unwritable file, or an interrupted run can leave some files updated and others not. The next successful run repairs them.

Before writing, generation type-checks the generated files, your route declarations, and any file that directly imports a generated file, using `skipLibCheck: false`. Other files are left to your Angular build.

Generated browser code contains only names, kinds and error metadata, never your schemas, stages, middleware or handlers: a route copy drops the server steps and the imports only they used, and names their types through an erased `import type` of its own `route.ts`. Keep server-only modules out of anything a page imports at runtime; the example names them `*.server.ts`. Each route copy loads with the record that reads it: a top-level route's with `routes.generated.ts`, in the startup bundle, and a nested route's with its parent's lazily loaded children, as the router's [lazy route children](../angular-router/README.md#lazy-route-children) describes.

`server.generated.ts` binds Launch's internal `bindApplication`, `createRequestScope`, `handleRpc`, `handleChannelUpgrade` and `provideLaunchServer` to your app. It imports them from `@loozo/angular-launch/_server`, an entry point for generated code only that isn't public API and can change in any release; use the generated functions instead. The app identity comes from the `package.json` name and the generation tsconfig's and output directory's paths within the app, so neither route edits nor moving the whole app directory change it.

RPC URLs are `/_rpc/<namespace>/<procedure>`, so they change only when you rename a namespace or procedure. Moving a route or the generation tsconfig doesn't change them. The example doesn't commit generated files: every build regenerates them, and its `check` configuration (`ng run todos:build:check`) verifies them without writing.

`@loozo/angular-launch/generation` is Node-only.

### Builders

#### `@loozo/angular-launch:application`

All `@angular/build:application` options, plus the generation options above (`tsconfig`, `scanDirectories`, `outDirectory`, and `tanstackQuery`, `translateSegments` and `check`, which default to `false`). It takes those out and passes every other option through unchanged. With `translateSegments`, it reads `localization` from the project's `i18n` and the build's `polyfills`, so it must run as a project target.

The builder runs generation once, then the official application build. Invalid options stop the build before generation starts. Generation errors, including drift with `check: true`, are logged and fail the build before the Angular build runs. `watch: true` is rejected; use the serve builder for watching.

#### `@loozo/angular-launch:serve`

All `@angular/build:dev-server` options, set in `angular.json` or on the command line (`ng serve --port 4300`), plus:

| Option        | Type              | Default  | Description                                                                              |
| ------------- | ----------------- | -------- | ---------------------------------------------------------------------------------------- |
| `buildTarget` | `string`          | required | A target that uses `@loozo/angular-launch:application`. Generation options come from it. |
| `poll`        | `number \| false` | `1000`   | The dev server's file-watch polling interval in milliseconds, or `false` for no default. |

Invalid options stop the serve builder before it generates anything, and so does an invalid build target. The build target must not resolve `check: true`, because serving always writes generated files. The initial generation must succeed before the dev server starts; if it fails, the error is logged and the builder reports a failed build.

The builder then watches the scan directory, and with `translateSegments` the catalogs too, and regenerates when files are added, changed or removed there. A pass starts once changes have been quiet for 150 ms, so saving several files at once or renaming a directory runs one pass. Passes run one at a time; changes during a pass cause one more. Adding, changing or removing a template, style, image, font or Markdown file (`.html`, `.css`, `.scss`, `.sass`, `.less`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`, `.svg`, `.ico`, `.woff`, `.woff2`, `.ttf`, `.otf` or `.md`) doesn't regenerate, since generation never reads one; Angular's dev server still rebuilds for it. Such a file still regenerates when it's a symlink or a translation catalog, or when it changes during a pass or after a failed one. A generation tsconfig, or a config it extends, with one of those extensions inside the scan directory isn't supported: editing it doesn't regenerate. A failed pass is logged and the server keeps running; the next change retries. Other files, such as a server module a stage imports, don't trigger generation: route copies name their types through their route's declaration, not as text, so there's nothing to regenerate, and Angular's build still checks them. A route edit rebuilds twice, once for the edit and once for its regenerated copy, so the first reload can briefly pair new server code with the old copy.

Polling is on by default because Angular 22.2.2's native file watcher misses edits to files inside a renamed directory, which leaves the dev server serving stale output. It costs some idle CPU. Set `"poll": false` in the serve target to go back to native file events; Angular's own configuration then applies, including a `poll` on the build target. A positive number overrides the build target's `poll`; `0` is rejected. On the command line, `--poll` accepts milliseconds only. `poll` configures Angular's dev-server watcher; Launch's own watcher uses native file events.

### Generation sessions

`generate` starts from scratch on every call. A long-running tool that regenerates repeatedly (for example, after file changes) can create a session instead, which reuses compiler work between calls:

```js
import { createGenerationSession } from "@loozo/angular-launch/generation";

const session = createGenerationSession(workspace, {
  tsconfig: "tsconfig.app.json",
  scanDirectories: ["src/routes"],
  outDirectory: "generated",
});

try {
  await session.generate();
  // …after the next change:
  await session.generate();
  await session.generate({ check: true });
} finally {
  await session.dispose();
}
```

The options are fixed when the session is created. Edits inside the app, including moves, are picked up by the next call; to move the app directory itself, dispose the session and create a new one. A session doesn't watch files and isn't coordinated with Angular's own watcher: you decide when to call `generate`, and must not start a second call before the previous one settles, since overlapping calls are rejected. A failed call doesn't break the session; the next call starts clean. After you change dependencies, create a new session. `dispose()` stops publishing from any active call, waits for it, and makes later calls reject. Don't run two sessions or generators against the same output at once.

## Limitations

- Streams and channels don't reconnect or resume on their own (`connect()` reconnects when asked or when its input changes), and HTTP interceptors don't see them. Channels carry strict JSON text only, one call per socket, with no acknowledgements.
- Beyond hydration, the only query cache is TanStack Query's, through the optional [integration](tanstack-query/README.md#limitations), which has its own limitations. Optimistic updates and invalidation are TanStack's too, as its guide [shows](tanstack-query/README.md#optimistic-updates); Launch adds no helpers for them. Without it, nothing is invalidated for you.
- No server-side storage adapters; persistence is your handler's job. Remembered search keys use browser cookies through [`searchCookies()`](#remembered-search-keys).
- No production authentication, CORS or caching policy. You provide those. Cross-origin RPCs are refused (see [Cross-origin requests](#cross-origin-requests)); there's no CSRF token scheme.
- No success status other than 200: a result is always 200, and other statuses come from failures and outcomes. During server rendering, a cookie set by one call isn't visible to later calls in the same render, a failed initial navigation loses the render's cookies, and headers are dropped.
- Aborting is advisory: handlers get a `signal`, but work that ignores it finishes, a write may already have committed, and nothing is rolled back.
- Middleware is server-side only: there's no client middleware (use an Angular HTTP interceptor), and no dedupe of middleware listed twice.
- Redirects go to declared destinations only: an external destination, such as an OAuth provider, is data your page acts on, and a redirect target's search keys must be declared on its route. Outcomes act only in navigation, through `rpcNavigationErrors`, and nothing maps `FORBIDDEN` to a page: a stage that guards a page's reads throws `redirect()` or `notFound()` instead.
- A route can't opt out of its ancestors' stages, and a stage's failure fails every later call in the same request scope, such as the rest of a server render.
- An active-route handle's `remote` and `queries` use the `injectActiveRoute()` caller's injector, so providers a route adds reach only its own `injectRoute()`.
- Middleware written inline in `.use()` doesn't infer the route's context type; give it the keys it reads.

## Further reading

- [TanStack Query](tanstack-query/README.md): the optional query and mutation integration
- [`SPEC.md`](SPEC.md): the full contract, including every edge case
- [`examples/angular-launch`](../../examples/angular-launch/): the todos app. Its cookie identity and in-memory database are test fixtures, not security or deployment guidance.
- [`@loozo/angular-router`](../angular-router/README.md): routes, codecs and navigation

## Developing this package

```sh
pnpm run build       # builder schemas, then tsc
pnpm run typecheck
pnpm run test        # node --test
node tests/packed.mjs /absolute/new-directory   # packed consumer check; directory must not exist
```

The packed check keeps its consumer, pnpm store and temporary files inside the directory you pass. The build regenerates the builder schemas in `schemas/` from the installed `@angular/build`; `tests/schema.test.mjs` fails when a committed schema is stale.
