# @loozo/angular-launch

Launch adds typed server procedures to an Angular application. It builds on `@loozo/angular-router`, the official Angular toolchain and `@angular/ssr`: there is one route tree, one rendering system, and no RPC-specific tree. This document is the product contract; the [README](README.md) shows how to use it. Statements are normative unless marked as examples or limitations. Code samples are illustrative; filenames and names in them are examples.

## Product boundary

Angular owns rendering, hydration, the HTTP pipeline, the transfer cache and the build; `@loozo/angular-router` owns routes, URLs and navigation. Launch adds RPC declarations next to routes, their generated clients and server wiring, transports for queries, mutations, streams and channels, and Angular builders that run generation before Angular's own.

### Supported surfaces

| Surface                                 | Contract                                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@loozo/angular-launch`                 | Browser and shared API: `RpcError`, `frameworkFailures`, `RpcRedirect`, `RpcNotFound`, `rpcNavigationErrors`, and the client, connection and input-issue types                       |
| `@loozo/angular-launch/server`          | Server definitions: `defineContext`, `defineRpc`, `middleware`, `forbidden`, `notFound`, `redirect`, `finishLaunchRendering`, and the definition, response-control and handler types |
| `@loozo/angular-launch/node`            | `createUpgradeHandler` for channels on Node (§Channels)                                                                                                                              |
| `@loozo/angular-launch/generation`      | Node-only `generate()` and `createGenerationSession()` (§Generation and builders)                                                                                                    |
| `@loozo/angular-launch/tanstack-query`  | `provideLaunchQueries`, `RpcQueries` (§TanStack Query integration)                                                                                                                   |
| `@loozo/angular-launch:application`     | Angular Architect application builder                                                                                                                                                |
| `@loozo/angular-launch:serve`           | Angular Architect dev-server builder                                                                                                                                                 |
| Colocated `rpc.generated.ts`            | Parameterless `injectRpc()`, plus `injectQueries()` and `Queries` with `tanstackQuery`                                                                                               |
| `<outDirectory>/server.generated.ts`    | `createContext`, `handleRequest`, `handleUpgrade`, `provideServer` and the registry                                                                                                  |
| `<outDirectory>/context.generated.d.ts` | The context type registration                                                                                                                                                        |

`@loozo/angular-launch/_server`, `/_generated` and `/_tanstack-query` serve generated code only: they aren't application API and can change in any release.

## Authored application

```text
src/
├── context.ts
└── routes/
    ├── route.ts
    └── +authenticated/
        ├── route.ts
        ├── rpc.ts                 session namespace
        └── todos/
            ├── route.ts
            ├── rpc.ts             todos namespace
            ├── page.ts
            ├── route.generated.ts router-owned
            ├── rpc.generated.ts   Launch-owned
            └── $todoId/
                ├── route.ts
                ├── rpc.ts         todo namespace
                └── rpc.generated.ts
```

The filenames above are organizational examples. Discovery authenticates imported `defineContext` and `defineRpc` identity statically, like the router's existing declaration discovery, and recognizes `query` / `mutation` / `stream` / `channel` as the bindings of `defineRpc`'s builder callback. It does not execute authored modules. A default `defineRpc()` declaration is associated with its colocated discovered route declaration. A route has at most one group; more are rejected. Namespaces, procedure names and error codes are ASCII identifiers (letters, digits and `_`, not starting with a digit), and `__proto__` is reserved. Explicit schema expressions can't contain absent or nullish branches.

### One application context

```ts
import { defineContext } from "@loozo/angular-launch/server";
import { db } from "./database";
import { sessions } from "./sessions";

export default defineContext(async (request: Request) => ({
  request,
  db,
  user: await sessions.authenticate(request),
}));
```

Exactly one definition per application; a fresh value per live request, and one per page Angular prerenders, from a cookie-less `GET` of the page's URL (§Prerendering). Global means application-wide typing, not mutable singleton request state. There is no context inheritance.

An application-scoped generated declaration registers the inferred, awaited context type:

```ts
import type { ContextOf } from "@loozo/angular-launch/server";
import type context from "../src/context";

declare module "@loozo/angular-launch/server" {
  interface Register {
    context: ContextOf<typeof context>;
  }
}
```

Generation bootstraps this registration before semantic checking. Registrations must not merge unrelated applications into one TypeScript program. Runtime registration separately imports/invokes the actual factory; declarations do not initialize anything.

### Named groups and explicit policy

```ts
import {
  defineRpc,
  forbidden,
  middleware,
  type MiddlewareArgs,
} from "@loozo/angular-launch/server";
import { todoIdSchema } from "./todo-inputs";

export const signedIn = middleware(async ({ context, next }) => {
  if (context.user === null) {
    throw forbidden();
  }

  return next({ user: context.user });
});

export const ownTodo = middleware(
  async ({ context, input, next }: MiddlewareArgs<{ user: User; db: Db }, { id: string }>) => {
    const todo = await context.db.todos.findForUser(context.user.id, input.id);

    if (todo === null) {
      throw forbidden();
    }

    return next({ todo });
  },
);

export default defineRpc(
  "todos",
  ({ query, mutation }) => ({
    list: query({
      handler: ({ context, signal }) => context.db.todos.listForUser(context.user.id, { signal }),
    }),

    complete: mutation({
      input: todoIdSchema,
      use: [ownTodo],
      errors: {
        NOT_FOUND: {
          status: 404,
          message: "Todo does not exist",
          data: todoIdSchema,
        },
      },
      handler: async ({ context, errors }) => {
        const todo = await context.db.todos.complete(context.todo.id);

        if (todo === null) {
          throw errors.NOT_FOUND({ id: context.todo.id });
        }

        return todo;
      },
    }),
  }),
  { use: [signedIn] },
);
```

- `defineRpc` is the group discovery marker. Its second argument is a builder callback: an arrow function whose single parameter destructures any of `query`, `mutation`, `stream` and `channel` without renames, defaults or rest, and whose body is a parenthesized object literal of procedures, each a direct call of one of those bindings with one inline options object. The binding name gives the kind; there's no `kind` field in authored config. Procedure option keys are `handler`, `input`, `use` and `errors` for every kind, plus the required `message` for channels (§Channels); the only group option key is `use`. Generation doesn't read `use` contents; TypeScript checks them.
- Namespaces prevent procedure-name collisions. Each namespace is unique across the app, because it names the group on the wire (§Wire identity); a duplicate anywhere is a generation error.
- The existing route tree determines available groups: local plus ancestor groups, including pathless nodes. No sibling/descendant traversal API is required.
- Availability is not authorization. An HTTP caller who knows another group's identity still encounters that group's middleware.
- Middleware is explicit on a group (`defineRpc`'s `use`) and/or a procedure (its `use`); it doesn't inherit through route ancestry. Because the group's procedures are built inside its callback, a procedure can't miss its group's middleware, and handlers are typed with what it adds. There's no dedupe: middleware listed on both runs twice.
- A call runs: group middleware with no input (`input` is `undefined`), input validation, procedure middleware with the validated input, then the handler. Group middleware therefore refuses an unauthenticated caller with `FORBIDDEN` before its input is validated.
- `middleware(run)`: `run` receives `{ context, input, request, signal, response, next }`. `next()` or `next(added)` continues the call, merging `added` into the context by spread (the context must be a plain object), and resolves to an opaque token `run` must return; it rejects when anything after it throws, so middleware can wrap the rest of the call. Calling `next` twice, or returning anything other than its result, fails the call with `INTERNAL`, logged. Middleware and handlers see `context` as read-only at the top level (type-only; the object isn't frozen), so changes go through `next()`. A middleware needs the registered `Context` and `unknown` input unless its argument is annotated `MiddlewareArgs<Needs, Input>`. Each `use` entry must accept the context and input accumulated before it, and handlers see the final context; a misfit fails type checking on the offending entry. Group-level input is `unknown`, so a middleware that needs input only fits on a procedure.
- `forbidden()` returns an `Error` branded with a non-enumerable `Symbol.for("@loozo/angular-launch/outcome/v1")` property, which survives duplicate module copies in the entry and render bundles and can't come from JSON. Thrown from middleware or a handler it becomes the `FORBIDDEN` frame. `notFound()` and `redirect(to)` carry the same brand (§Outcomes). Declared errors stay handler-only; anything else thrown becomes `INTERNAL`.
- Handlers receive `{ context, input, errors, request, signal, response }` (§Response control). `request` is the live request the call runs in: the scope's copy of the RPC HTTP request, the page request during rendering, or the prerender scope's cookie-less `GET` of the page's URL while Angular prerenders it. Middleware runs during rendering too, so request-shaped checks (method, `Sec-Fetch-Site`) don't belong in middleware.
- There are no Launch resolvers, inherited resolver data, or RPC `parent` references. Fetch data with ordinary typed functions in handlers. Native Angular route resolvers remain available.
- Route params/search values are explicit procedure inputs, never automatically bound or trusted.

## Validation, values and errors

Input uses Standard Schema V1. The caller supplies the schema's input type; procedure middleware and handlers receive its validated/transformed output. Async validators are supported. Launch does not choose a schema library or invent a schema system. Schemas remain server implementation values unless the app independently imports them.

Results and transmitted inputs are strict JSON-safe. Direct SSR and HTTP apply the same encoding and decoding, not raw server values on only one path. Dates require explicit conversion. Undefined/void, nonfinite numbers, custom prototypes, sparse arrays and cycles are rejected rather than silently advertised as client DTOs. Optional/undefined output fields must be converted to an explicit JSON shape. Received JSON text is held to the same subset: a number literal that overflows to a nonfinite number (`1e400`) is malformed, `INVALID_INPUT` with no issues on the server (HTTP and rendering bodies, a channel's opening input and its message frames) and a `TypeError` on the client (stream event data, channel frames).

Public errors are implemented as procedure-local inline literal declarations: identifier code, nonempty literal message, integer literal status 400–599 and explicit concrete Standard Schema data (including `Schema<null>` for no data). A handler's inferred `errors.NOT_FOUND()` accepts schema input and synchronously creates a throwable, **not** already-validated public data. Shared dispatch awaits validation/transformation and strict-JSON-checks the schema output before publishing. The actual registered procedure owns the factory-failure identity and original declaration, including across native entry/render module duplication. Foreign factory failures, lookalikes, plain exceptions, schema issues/throws and non-JSON schema results produce generic `INTERNAL` and server-only diagnostics.

Input validation failures are field-addressable. `INVALID_INPUT` carries `InvalidInputData` (`{ issues: readonly InputIssue[] }`, both root exports), where each `InputIssue` is exactly `{ path: readonly (string | number)[], message: string }`. Dispatch normalizes the input schema's Standard Schema V1 issues in order: a path segment may be a property key or a `{ key }` segment; strings and finite numbers are kept; an issue with a symbol or any other unrepresentable segment gets the root path `[]` and is never stringified into an invented field. Only path and message are published, never vendor issue fields, input values or stacks, so input schema messages are public and written for users. Malformed requests and envelopes (such as a wrong method, media type or query string, non-JSON bodies, envelopes other than exactly `{ input }`, non-null input without a schema) carry `{ issues: [] }`. Direct SSR and HTTP publish identical issues. `FORBIDDEN`, `RPC_NOT_FOUND` and `INTERNAL` keep `null` data. Group middleware precedes validation, so a caller it refuses can't probe input schemas; procedure middleware follows validation and receives the validated input.

A path that names no procedure fails with `RPC_NOT_FOUND`, status 404 and message `"RPC not found"`. The framework codes `INVALID_INPUT`, `FORBIDDEN`, `INTERNAL` and `RPC_NOT_FOUND` are reserved against business declarations, and the object-literal key `__proto__` is unavailable. Business `NOT_FOUND` is ordinary typed data. There's no origin discriminator and no blanket reservation of other business identifiers.

Generated browser metadata includes genuine kind and declared code/status/message only, not runtime schemas, handlers or context. Clients validate exact frame shape, strict JSON, known code/status/message and, for framework failures, their exact data (`InvalidInputData` for `INVALID_INPUT`, otherwise `null`), then associate converted `RpcError` instances privately with group/procedure ownership. Arbitrary `RpcError` instances and another procedure's failures do not pass `.isError()`. Schema output validation remains server-side; the browser does not reimplement schemas. `ClientRpcError<typeof group.procedures.complete>` and procedure-specific `isError()` narrow to a discriminated union of declared schema-output data plus the fixed framework failures: `INVALID_INPUT` with `InvalidInputData`, the others with `null` data:

```ts
try {
  await rpc.todos.complete({ id: "123" });
} catch (error) {
  if (!rpc.todos.complete.isError(error)) {
    throw error;
  }

  if (error.code === "NOT_FOUND") {
    console.log(error.data.id);
  }
}
```

TypeScript has no checked exception parameter on `Promise<T>`, so Launch exposes error metadata and type guards rather than claiming automatic catch typing. Network failures, local cancellation and local encoding failures remain distinct from server business failures. The optional TanStack Query integration below consumes operation kinds, identity, results and error metadata without changing this client.

### Outcomes

`notFound()` and ``redirect(to: `/${string}`)`` from `/server` are thrown outcomes, branded like `forbidden()`, for a page that can't be shown. `redirect` accepts only a root-relative URL that resolves to the same origin, so `//host`, `/\host` and tab- or newline-smuggled forms throw `TypeError` at creation; `@loozo/angular-router`'s `createUrl` returns `` `/${string}` `` so its result type-checks. Dispatch turns them into frames on both transports: `redirect` is status 303 with exactly `{ redirect: { to } }` and no `Location` header (with a null location, fetch returns the response instead of following it), and `notFound` is status 404 with exactly `{ notFound: null }`. Only status 200 is a result: every other status carries a frame dispatch built itself, so a handler result shaped like a frame stays data, and the rendering backend emits `HttpErrorResponse` for every non-200 reply. They aren't framework codes: `RPC_NOT_FOUND` stays the missing-procedure failure, and business `NOT_FOUND` stays declarable. Wrapping middleware sees them as `next()` rejections, like declared errors.

Clients recognize an outcome frame by exact shape, strict JSON and its own status (and a root-relative `to`), and reject with `RpcRedirect` (with `to`) or `RpcNotFound`, root exports. They aren't `RpcError`s and aren't procedure-owned; `isError()` is false for them, and anything else stays the original error.

`rpcNavigationErrors({ notFound })` (root export, with `RpcNavigationErrorsOptions`) returns a handler for Angular's `withNavigationErrorHandler`, run in the router's injection context. A navigation whose guard or resolver failed with `RpcRedirect` returns `new RedirectCommand(router.parseUrl(to))`; during SSR the final URL then differs from the requested one, so Angular's server answers 302 to it. `RpcNotFound` sets `RESPONSE_INIT.status = 404` when provided and returns a `RedirectCommand` to `notFound` with `browserUrl` set to the navigation's URL, so the not-found page renders at the requested URL; Angular reads `RESPONSE_INIT` after the app is stable. Other errors return `undefined`, Angular's default. Outcomes act only in navigation: elsewhere, calls just reject. An app with its own navigation error handler calls the returned function from it. A server-rendered not-found page calls its procedure again during hydration, because only successful responses transfer; a redirect doesn't. Any other guard or resolver failure during SSR, or an outcome without the handler, leaves Angular without a successful navigation, so `angular.handle` returns `null` and the server's fallback answers, without the render's cookies (§Response control); mapping `FORBIDDEN` to a page is out of scope. The root entry imports `@angular/router` for this, a peer dependency, so it needs `@angular/compiler` or the linker in Node, like `_generated`.

## Generated client

Every retained route gets a separate colocated `rpc.generated.ts`, even without a local RPC group. Its parameterless `injectRpc()` binds the available groups statically by origin declaration. Angular DI supplies transport; the client does not inspect the active URL or require completed route activation.

```ts
import { injectRpc } from "./rpc.generated";

const rpc = injectRpc(); // Inside an Angular injection context.

await rpc.todos.list();
await rpc.todos.list({ signal });
await rpc.todo.get({ id: "123" }, { signal });
```

Callables return promises. Input procedures take input then optional call options; no-input procedures take optional options only. Client cancellation unsubscribes HttpClient and rejects with `AbortError`. On the server, the call's middleware and handler see their `signal` abort; "SSR, hydration and prerendering" describes that signal over HTTP and during rendering. Cancellation is advisory: work that doesn't pass the signal on still finishes, and a cancelled mutation may already have committed.

Generated browser facades don't import server implementation modules or the context at runtime. Launch doesn't check what the application's own modules import: keeping server-only modules out of the browser graph is the application's job, and names or type-only imports alone don't isolate a module.

### Wire identity

The namespace is the group's wire identity. It is unique across the app, so the path doesn't depend on effective URLs, source location or scan order: pathless declarations can share URLs, and moving an `rpc.ts` doesn't change its procedures' paths. Registry lookup supplies the real operation kind; the caller cannot relabel a mutation as a query.

```http
POST /_rpc/<namespace>/<procedure>
Content-Type: application/json

{"input":{"id":"123"}}
```

The envelope keeps primitive schema inputs JSON-encoded consistently by HttpClient. The wire format isn't a versioned protocol: a client from one Launch release isn't promised to work with a server from another. Launch sets no size limit on HTTP request bodies; limit them in the host or proxy. Channel frames are limited by `createUpgradeHandler`'s `maxPayload` (§Channels).

### HTTP request checks

The generated `handleRequest(request, { allowedHosts, origins = [] })` (`HandleOptions`, exported from `/server`) answers HTTP RPCs in this order, creating no context before step 5:

1. A path not starting with `/_rpc/` returns `null`.
2. The hostname of `request.url` must match `allowedHosts` as Angular matches its own: exactly, `*.example.com` for subdomains only, or `*`. `allowedHosts` is required and an empty list refuses everything. Otherwise: 400, `text/plain`, `X-Content-Type-Options: nosniff`, body `Host not allowed` (Angular's page behavior, not a Launch frame); the hostname is logged.
3. `POST`, `application/json` and no query string, otherwise `INVALID_INPUT` with no issues.
4. Same origin, otherwise `FORBIDDEN`, logged with the reason: an `Origin` listed in `origins` (exact serialized origins) passes; otherwise a present `Sec-Fetch-Site` must be exactly `same-origin` (`same-site`, `cross-site`, `none` and anything else refuse); otherwise a present `Origin` must equal `request.url`'s origin (`Origin: null` refuses); a request with neither header is refused. No `Referer` fallback and no opt-out.
5. Context creation, envelope parsing and dispatch, unchanged.

Non-browser callers (curl, scripts, Node `fetch`, server-to-server) must send `Origin`. Browsers send `Sec-Fetch-Site` only to potentially trustworthy origins, so plain-HTTP deployments on other hostnames rely on `Origin`, and behind a proxy that rewrites `Host` the public origin must be listed in `origins`. The same `allowedHosts` array is passed to `AngularNodeAppEngine`, whose explicit list replaces its `NG_ALLOWED_HOSTS` read; `angular.json`'s `security.allowedHosts` stays page-only. Steps 2 and 4 are HTTP-only: server-rendering dispatch carries the page request (`Sec-Fetch-Site` `cross-site` or `none` on ordinary navigations) and isn't checked.

## Response control

Middleware and handlers get `response: ResponseControl` (exported from `/server` with `CookieOptions`): `setCookie(name, value, options?)`, `deleteCookie(name, options?)` and `headers`, a `Headers` object. Its members are function properties, so destructuring is safe. Each transport creates the effects for one call, passes them to `dispatch` and commits them when it produces its response.

- **Cookies.** `setCookie` serializes one `Set-Cookie` value: `name=value; Path=…` then `Domain`, `Max-Age`, `Expires`, `HttpOnly`, `Secure` and `SameSite` as set. Defaults: `path: "/"`, `httpOnly: true`, `secure: true`, `sameSite: "lax"`. The name must be an RFC 9110 token, the value RFC 6265 cookie-octets (no encoding is applied), `path` and `domain` printable ASCII without `;`, `maxAge` an integer, `expires` a valid date, and `sameSite: "none"` needs `secure`; otherwise it throws a `TypeError` (the call fails with `INTERNAL`). `deleteCookie` takes the same options without `maxAge` and `expires`, and sets an empty value with `Max-Age=0` and `Expires=Thu, 01 Jan 1970 00:00:00 GMT`. Cookie prefixes (`__Host-`, `__Secure-`) aren't checked.
- **HTTP.** Once the call reached `dispatch`, its JSON response carries the call's headers, then Launch's own over them with `set` (`Content-Type`, `Cache-Control`, `Vary`, `X-Content-Type-Options`), then one `Set-Cookie` per cookie, for every outcome: result, declared error, framework failure, `INTERNAL`. Effects aren't dropped on failure, because what a cookie records has usually happened before a later failure, such as a session a middleware refreshed before the handler failed; a handler that shouldn't send a cookie on failure sets it after the steps that can fail. Refusals before context creation (host, method, origin, unparsable body) carry none. Status isn't settable.
- **Rendering.** When the call settles, whatever its outcome, the server backend appends its cookies to `RESPONSE_INIT`'s headers (Angular 22 creates them as `Headers`; other `HeadersInit` values are replaced by a `Headers` copy), so they reach the page response and a 302 Angular builds from the same headers; headers are dropped, so a page's headers don't depend on which queries ran. `RESPONSE_INIT` is injected optionally; without it, a call that set cookies fails with `INTERNAL`, logged. Every call in a render receives the same context value, created once from the page request, and the page request as `request`, so a cookie one call sets isn't visible to later calls in the render; Launch doesn't rewrite the `Cookie` header or recreate the context. A session refresh that should run once per render keeps a cell in the context (README §Cookies and headers); concurrent HTTP requests each have their own context, so the session store must tolerate concurrent refreshes anyway. A failed initial navigation (`angular.handle` returning `null`) discards `RESPONSE_INIT`, so the render's cookies are lost with the page; Launch doesn't hand them to the server entry. Angular 22.2.2's `renderAngular` awaits `whenStable()` and `handleRendering` then builds the page `Response` from `RESPONSE_INIT`, copying its headers before final serialization, so only calls that settle before the app is first stable deliver cookies; a call made during serialization (`BEFORE_APP_SERIALIZED`) succeeds but its cookies are lost. Launch doesn't detect that case. While Angular prerenders a page there's no `RESPONSE_INIT` and no response: a cookie set then is a prerender fault (§Prerendering), and the reply still reaches the caller.
- **Commit.** Effects commit when the response is produced: when the call settles, or for a stream when its handler returned its iterable (§Streams). After that `setCookie` and `deleteCookie` throw, and changes to `headers` are ignored, so a wrapping middleware's header after `await next()` reaches query and mutation responses and is ignored for streams.

## SSR, hydration and prerendering

```text
Generated callable → HttpClient → Angular interceptors/transfer cache → backend
  Server backend: direct dispatcher with current request context
  Browser backend: real HTTP request, fresh server context
```

A server-only backend adapter keeps Angular's public HTTP pipeline and PendingTasks tracking. It emits ordinary HttpResponse/HttpErrorResponse events. Direct backend execution must use the same validated JSON envelope, serialization and middleware/error pipeline as HTTP.

The live server request creates context and passes it to Angular's app engine. Angular exposes it via `REQUEST_CONTEXT` in the render-local application. SSR calls reuse that value; later browser HTTP calls create new context. Server wiring must use `angular.handle(scope.request, scope)`: the generated app identity and a private per-request token bind the scope to Angular's native `REQUEST`, including proxy-sanitization clones and separate entry and render bundles. That catches pairing mistakes, not incorrect authentication or arbitrary server code. Mutations through rendering transport are rejected with the fixed `FORBIDDEN` frame before any middleware, input schema, handler or writes. Both marked generated calls and unmarked local HttpClient calls use actual registry kind, without HTTP fallback or context recreation; caller relabeling or forced transfer-cache options cannot authorize a write. Manual server dispatch defaults to HTTP semantics and has an explicit final `'rendering'` mode. This is not a guarantee that arbitrary application code or external HTTP calls cannot write during rendering.

Middleware and handlers get an abort `signal`. Over HTTP it is the scope request's signal, a clone of the incoming request's, so it aborts when the host's `request.signal` does; Angular's Node `createWebRequestFromNodeRequest` signal doesn't abort once the body has been read, so the documented Node server entries link a signal that aborts a microtask after the response closes unfinished: by then `writeResponseToNodeResponse`'s own `close` listener has cancelled a body it was writing, which aborting first would fail, and the helper would log that failure. During rendering it is `AbortSignal.any([pageRequest.signal, perCall.signal])`, where the per-call signal aborts when HttpClient unsubscribes before the call settled; while prerendering, the page request is the prerender scope's, whose signal aborts when the render's application is destroyed. Aborting is advisory: a handler that ignores it still finishes, and a write may already have committed.

Queries default to HttpClient transfer caching and preserve opt-out. Mutation options accept only `transferCache:false`; the generated helper forces false even for untyped callers. Matching requests during hydration reuse the transferred response without network. Angular disables this HTTP cache after browser stability; it is not an ongoing query cache. POST body, URL, method, response type and params must match. Auth/credential/noncacheable-header exclusions and origin mapping require deliberate handling. Only intentionally browser-visible DTOs transfer; request context never does. Personalized HTML must not be published through a shared/public cache.

### Prerendering

Angular 22.2 prerenders (`RenderMode.Prerender`, `ɵSERVER_CONTEXT` `'ssg'`) without `REQUEST`, `REQUEST_CONTEXT` or `RESPONSE_INIT`, at `http://localhost:<port>/<path>` when it started the SSR entry on loopback for the build, otherwise `http://ng-localhost/<path>`. Route discovery also boots the app without `REQUEST` (server context `'other'`). Launch doesn't tell the two apart: it doesn't read the private token, and `@angular/ssr`'s public `IS_DISCOVERING_ROUTES` would make `@angular/ssr` a dependency, which Launch doesn't have.

- **Context.** Without `REQUEST`, the server backend resolves targets against the document's URL instead of the page request's and intercepts the same calls; other HTTP requests go to Angular's backend unchanged. The first intercepted call creates the render's scope with `createRequestScope(application, new Request(pageUrl))`, a cookie-less `GET` whose signal aborts when the render's application is destroyed; every call in the render shares it, as in SSR, and `REQUEST_CONTEXT` is ignored. Dispatch is `"rendering"`, so mutations and streams are refused with `FORBIDDEN`. A prerendered page therefore shows what an anonymous visitor sees, like TanStack Start's cookie-less crawl. Not provided: a separate build-time factory (two context shapes for middleware to type against) and context-free static procedures (no typed pipeline).
- **Faults.** Every intercepted call that starts before the app is first stable must answer 200 without setting a cookie. Any other reply (refusals before dispatch included), a cookie, or a context factory that throws records the render's first fault, `Launch can't prerender this page: <path> answered <status> <body>` / `<path> set a cookie` / `its context factory threw` (with the factory's error as `cause`); the caller still gets the reply (`INTERNAL` for the factory). `finishLaunchRendering` awaits `whenStable()`, destroys the application and throws the fault, failing the build, because Angular can log a resolver error, emit no page and still report success (seen on 22.1.5), and a failed `injectQuery` would otherwise render its error state into the file. A call made after that, such as one awaited in a `BEFORE_APP_SERIALIZED` hook, isn't checked: Angular 22.2.2's `renderInternal` runs those hooks after bootstrap returns and passes their errors to the `ErrorHandler`, and the render worker fails a page only when rendering throws, so nothing public can fail the build from there. Its fault is recorded and never read, and the page is written; the README says not to call Launch there, as for cookies during SSR serialization. Live SSR records no faults.
- **After build.** Results reach the browser in the HTML only, through the HTTP transfer cache (keyed by the relative `/_rpc/` URL, so the build's loopback origin doesn't matter) or TanStack dehydration; hydration makes no RPC. Every later call, including a client-side navigation to the page, is an ordinary HTTP RPC with the visitor's context, so queries on prerendered pages should answer the same for everyone. Static deployments (`outputMode: "static"`) can't answer them and are unsupported for pages that call RPCs. Not provided: TanStack-style emitted result files (`staticFunctionMiddleware` writes `/__tsr/staticServerFnCache/<sha1>.json` and the production client always fetches it, with no server fallback), which would need a procedure option, input hashing, worker-to-output plumbing and a rule for inputs that weren't prerendered, and have no consumer; the docs site loads build-time content as generated modules. ISR is out of scope.
- **Dev.** `ng serve` renders prerender routes per request the same way, with the anonymous context.

Blocking initial navigation (`withEnabledBlockingInitialNavigation`) is unsupported, with or without a root resolver (limitation, observed on Angular 22.2.2). Route discovery calls the server bootstrap with root-component bootstrap disabled, releases the initial navigation (`afterPreactivation().next()`) only after the bootstrap returns, then awaits `whenStable()`. `finishLaunchRendering` awaits `whenStable()` inside the bootstrap, before that release, so discovery waits until Angular's 30 s extraction timeout and the build fails. The planned fix (§Decided limitations) returns without waiting when no root component was bootstrapped, which happens only during discovery. A root resolver's RPC then runs during discovery with the anonymous context, and Angular logs a refusal there without failing the build.

## Streams

A `stream` procedure is a read that sends values while it runs. Its options are a query's; its handler returns an `AsyncIterable` of strict JSON values whose return type is `void` (a non-void return is a type error), written `handler: async function* (args) { … }`. Generation doesn't accept method shorthand in options, so `async *handler()` is rejected. Generated metadata carries `kind: "stream"`; `injectQueries()` omits streams, and `RpcQueries` has no key for them.

**Dispatch.** A stream runs the same pipeline as a query (group middleware, validation, procedure middleware, handler). In `"rendering"` mode it's refused with `FORBIDDEN` before any of it, as mutations are. Over HTTP, `dispatch` gets a `start` callback: once the handler returns its iterable, the iterator goes to `start` and the innermost middleware step awaits the stream's end, so `next()` resolves when the stream ends, or once the handler returned after its body was cancelled, and rejects with the handler's error. `handleRpc` races the call against `start`: a reply first is an ordinary JSON response with its status (host, method, origin, `RPC_NOT_FOUND`, middleware refusals, `INVALID_INPUT`, a handler that throws or doesn't return an iterable); a start first is a 200 `text/event-stream` response with `Cache-Control: private, no-store, no-transform`, `Vary: Cookie`, `X-Content-Type-Options: nosniff` and `X-Accel-Buffering: no`, plus the call's cookies and headers, which commit then (§Response control). An `async function*` handler's body runs after that commit, so it can't set cookies; middleware before `next()` or a non-generator handler can. The call's signal is `AbortSignal.any([scope.request.signal, cancel])`, where `cancel` aborts when the host cancels the body; the body stops when that signal aborts, also when it was already aborted on creation. Angular's `writeResponseToNodeResponse` cancels a body it's writing when the response closes, but skips an already closed response without touching the body, so a client that leaves while context creation or middleware runs is only noticed through the request's signal: the documented close-signal wiring is required for that case.

**Wire.** The request is the ordinary `POST` envelope; the client also sends `Accept: text/event-stream`. The body is pull-based (a slow reader pauses the generator) and consists of `event: value\ndata: <strict JSON>\n\n` per value, then exactly one `event: end\ndata: null\n\n` or `event: error\ndata: {"status":<n>,"error":{"code","message","data"}}\n\n` once the whole call, middleware included, settled, plus `: keep-alive\n\n` every 15 s. The error data is the reply's frame with its status, built by the same failure, declared-error and outcome rules: `{"status":<n>,"error":{…}}`, `{"status":303,"redirect":{"to":…}}` or `{"status":404,"notFound":null}`. An `async function*` handler's body runs only after the response started, so outcomes it throws always arrive this way; middleware and handlers that throw before returning the iterable answer with the ordinary 303/404 JSON response. A value that isn't strict JSON fails the call (`INTERNAL`) and returns the suspended iterator. When the signal aborts, the body stops writing and errors, the handler's in-flight step (if any) is awaited and `iterator.return()` called, which takes effect at the generator's next yield. The handler's part settles once that return does: rejected if the step threw (a `next()` that throws synchronously counts), otherwise resolved, so wrapping middleware never cleans up under a running handler and never misses its failure.

**Client.** A stream callable takes `(input?, { signal }?)` and returns an `AsyncIterable` of the yielded type; each `[Symbol.asyncIterator]()` sends a new request with `fetch` (not `HttpClient`: its requests are `PendingTasks` until they complete, and `FetchBackend` keeps every chunk). Iteration ends on `end`; events that arrived in the same chunk aren't delivered once the signal aborted; throws a procedure-owned `RpcError` for an `error` event or a recognized error response, `RpcRedirect` or `RpcNotFound` for an outcome event or response, an `AbortError` for the signal and a `TypeError` for transport failures, a response whose media type isn't `text/event-stream`, a malformed or unknown event or data that isn't JSON, or a body that ends without `end`; returning early aborts the request. The client injects `PLATFORM_ID` only when its groups have streams; on the server platform every iteration fails at once with a procedure-owned `FORBIDDEN` and no request. Interceptors don't apply.

**Reconnection.** None automatic and no resume: iterating again is a new call with a fresh context, middleware and handler. Handlers yield the current state first. Launch doesn't use EventSource's built-in reconnection, because EventSource can only `GET` without a body, and a same-origin `GET` carries no `Origin`, which the same-origin check needs on plain HTTP.

**Server rendering.** Streams never run while rendering and never enter the HTTP transfer cache. Pages render from a query and follow the stream after hydration; streams add no pending tasks, so an open stream doesn't hold stability, Angular's transfer cache or Launch's TanStack hydration window open.

**TanStack.** No generated options: TanStack's `streamedQuery` (query-core 5.104.3 exports it as `experimental_streamedQuery`) keeps a query fetching until the stream ends, and `@tanstack/angular-query` adds a pending task while a query is fetching, so an open stream query would keep the app from becoming stable.

**Hosts.** Tested on the built Node server (through `writeResponseToNodeResponse`, with and without the close-signal wiring for a stream already being sent), under `ng serve` and with a platform-neutral build on Deno. Tailscale Serve uses Go's `httputil.ReverseProxy`, which flushes `text/event-stream` immediately; that's known from its source, not tested. Websockets are channels (§Channels).

## Channels

A `channel` procedure talks both ways over one websocket. Its options are a stream's plus a required `message` Standard Schema, held to the same concrete-type rule as `input`; generation requires `message` on channels and rejects it elsewhere. The handler is a stream handler (`async function*`, strict JSON yields, `void` return, no method shorthand) that also receives `messages: AsyncIterable<OutputOf<Message>>`. `Procedure` carries the schema as its fifth type parameter and `message` field, so the client's `send` takes the schema's input type. Generated metadata carries `kind: "channel"`; `injectQueries()` omits channels and `RpcQueries` has no key for them.

```ts
add: channel({
  message: titleSchema,
  handler: async function* ({ context, messages }) {
    yield await context.db.todos.snapshotForUser(context.user.id); // current state first
    for await (const { title } of messages) {                      // validated, in arrival order
      await context.db.todos.addForUser(context.user.id, title);
      yield await context.db.todos.snapshotForUser(context.user.id);
    }
  },
}),
```

**Messages.** Validated with `message` as the handler reads them, one after another so an asynchronous schema can't reorder them. A failed message ends the call with `INVALID_INPUT` and the schema's issues: `messages` throws a `MessageRefused` (internal) that `dispatch` maps to that reply instead of logging `INTERNAL`, and the socket sends that frame whatever the handler and middleware make of the error. One consumer: a second `[Symbol.asyncIterator]()` throws a `TypeError`. `messages` ends when the socket closes, after the messages already received, so a handler waiting on it returns normally.

**Upgrade checks.** The generated `handleUpgrade(request, options: HandleOptions): Promise<Response | Upgrade | null>` sits next to `handleRequest` and is host-neutral (web `Request` in, a standard `WebSocket` accepted). In order, creating no context before step 5:

1. A path not starting with `/_rpc/` returns `null`, leaving the upgrade to other listeners (Vite HMR).
2. Host, as `handleRequest` (400 text).
3. `GET`, `Upgrade: websocket` and a query of exactly `input` holding strict JSON, otherwise `INVALID_INPUT` with no issues.
4. Same origin, as `handleRequest` (`FORBIDDEN`). Browsers send `Origin` on every handshake.
5. Context creation, then `dispatch` in `"socket"` mode: `RPC_NOT_FOUND` for a path that isn't a channel (and `"http"` mode answers a channel with `RPC_NOT_FOUND`; `"rendering"` refuses it with `FORBIDDEN`), group middleware, input, procedure middleware, handler.

Steps 2–4 answer with HTTP responses; a browser only sees an error event and close 1006 (a `TypeError` on the client). From step 5 the result is `Upgrade { headers, accept(socket) }`: the call's headers plus one `Set-Cookie` per cookie, committed then (setting a cookie later throws, as in a generator stream's body). A call that failed before its handler returned its iterable (including a context factory that throws: `INTERNAL`) also upgrades, and `accept` sends the failure frame and closes 1000, so the client gets the procedure's own error. The call's signal follows the request until `accept`, then the socket closing, never the request (Deno aborts `request.signal` on the 101). A request that aborts before the handler is reached skips it (an ordinary handler's setup doesn't run either) and the innermost `next()` resolves; one that aborts after the handler returned its iterable stops the started call as a stream's abort does, returning the iterator before its body runs. Either way a socket accepted afterwards is closed at once, without a frame.

**Wire.** `GET /_rpc/<namespace>/<procedure>?input=<encodeURIComponent(strict JSON)>` (`null` without input). Text frames, strict JSON:

```text
client → server  {"message":m}  one message
                 {"ready":n}    "I've read n more values"
server → client  {"value":v}
                 {"ready":n}    "the handler read n more messages"
                 then exactly one {"end":null} or failure frame ({"status":n,"error":{…}} | {"status":303,"redirect":{"to":…}} | {"status":404,"notFound":null}), then close 1000
```

Failure frames are a stream's `error` event data (`failureFrame`). A binary frame, malformed or non-strict JSON, a frame that isn't an object with exactly `message` or `ready`, a message beyond the client's credit, or a grant that isn't a positive integer or exceeds the values outstanding ends the call with `INVALID_INPUT` (no issues); the call's signal aborts, and the frame is sent once the call settled. Frames arriving after the handler finished are dropped.

**Flow control.** Fixed credit windows, not configurable. Values: at most 256 unacknowledged; the client grants `{"ready":k}` once it has read 128 since its last grant. The server pulls the handler's next value only with credit and while the socket's `bufferedAmount` is under 1 MiB, polling every 50 ms while over; the generator stays suspended at `yield` meanwhile, and an abort then returns it at once. Messages: at most 32 unread; the server grants once the handler read 16 since its last grant. Credit 0 on one side implies at least half a window queued on the other, so a grant follows as long as each consumer reads. The raw client can still deadlock when the caller awaits more sends than both windows hold before reading; `connect()` always reads. The Node listener never pauses the socket (`ws.pause()` stops pong and close handling). Per connection that bounds memory to about 1 MiB of unsent values plus 32 × `maxPayload` of unread messages; throughput is about 256 values per round trip.

**Order and cancellation.** As streams: `next()` of the innermost middleware settles when the handler's part ends; the socket closing (or the request leaving before `accept`) aborts the signal, awaits the handler's pending step, returns its iterator and settles, rejecting if the step threw. After the handler ends, the server awaits the whole call's reply, sends the end or failure frame and closes 1000; a message in flight then is dropped.

**Node glue.** `@loozo/angular-launch/node` exports `createUpgradeHandler(handle, { maxPayload = 1 MiB })` returning an `upgrade` listener (its declarations reference only Node types and Launch's `Upgrade`). `ws` 8.21.3 is a regular dependency imported only there; its default `maxPayload` (100 MiB) is replaced, and a bigger frame closes 1009 (client `TypeError`). The listener builds the web `Request` itself (protocol from the socket's `encrypted`, host from `Host`, no proxy headers trusted, as Angular's `createWebRequestFromNodeRequest` default; Launch doesn't depend on `@angular/ssr`) with a signal that aborts on the socket's `end` or `close` until `ws` accepts it: Angular's helper signal never aborts here, and Chromium and WebKit send FIN when they leave early while Firefox sends nothing until accept. `null` leaves the socket alone; a `Response` is written raw (status line, headers, `Content-Length`, `Connection: close`, body) and the socket ends; an `Upgrade` is accepted with `ws` `noServer`, its headers added in the `headers` event, unless the client already left. Accepted sockets are pinged every 15 s and terminated after a missed pong. Creating the listener stores it in the process-global `Symbol.for("@loozo/angular-launch/upgrade-listener/v1")` slot (latest wins), for dev-server forwarding; create it at the server module's top level.

**Client.** A channel callable takes `(input?, { signal }?)` and opens a browser `WebSocket` at once (relative URL, so the page's base URL and `ws(s):`), returning `Channel<Received, Sent>`: an `AsyncIterable` of the yielded type with `send(message): Promise<void>`. `send` serializes `{ message }` (non-JSON rejects `TypeError`), queues in order until the socket is open and credit allows, resolves once handed to the socket, rejects with the channel's closing error if it closes first, and rejects `TypeError` once closed. One iterator. Values arriving before iteration are held (bounded by the server's window). Iteration ends on `end`; throws the procedure-owned `RpcError`, `RpcRedirect` or `RpcNotFound` for a failure frame (stream recognition), `AbortError` for the signal until iteration ends (queued values are dropped, also after the terminal frame arrived), `TypeError` for a close without a final frame, a refused handshake or a malformed frame. Overlapping `next()` calls settle in order. Leaving the loop or aborting closes 1000. No interceptors and no `PendingTasks`. On the server platform the channel fails at once with procedure-owned `FORBIDDEN` and no connection.

**Signals.** Streams and channels have `connect()`, Launch's own signal object rather than Angular `resource()` (whose `value()` throws in the error state, whose status can't show connecting, and whose reload resets the value). It must run in an injection context. Options: `input` (required with an input schema; without one optional, `null` connecting and `undefined` keeping it closed), `initial`, optional `reduce(state, value)`. It returns `value`, `status` (`"idle" | "connecting" | "open" | "ended" | "failed"`), `error` (`RpcError | RpcRedirect | RpcNotFound | TypeError | Error | undefined`, `Error` being what `reduce` threw, wrapped as an `Error` with it as `cause` when it isn't one), `reconnect()` (after ended or failed) and, for channels, `send()`. On the server platform it never connects: idle, `value` = `initial()`. In the browser it opens from `afterNextRender`, through an effect on `input`: a change closes the current call and opens another; `undefined` closes it and shows idle. It always reads, folding each value through `reduce` untracked from `initial()` for each new call (or taking the latest value without `reduce`). `value` reads `initial()` reactively until the first value; failures and reconnects keep it until the new call's first value. `status` turns `"open"` when the socket opens (a stream: when its response turns out to be an event stream) or a value arrives. `send` delegates while connecting or open and rejects `TypeError` otherwise; one waiting when the call fails rejects with the error `error()` shows, also when `reduce` throws (that fails the call too); one waiting when Launch closes the call, for a new input, `reconnect()` or destruction, rejects with `AbortError`. Its `DestroyRef` closes the call; a call closed for a new input or by destruction doesn't change `status` or `error`. No pending tasks, so an open connection never holds stability.

**Dev server.** Under `ng serve` the serve builder (§Generation and builders) passes Angular's dev server one connect middleware. On the first request through a server it attaches one `upgrade` listener to `request.socket.server` (Vite's HTTP server, which already carries Vite's HMR listener; Vite's own listener answers only `vite-hmr`/`vite-ping` upgrades) and always calls `next()`. That listener forwards upgrades whose raw request target starts with `/_rpc/` to the listener in the process-global slot, which the server module fills each time the dev server loads it, and leaves other upgrades alone. Angular's dev server loads `server.mjs` on an HTTP request that reaches its SSR middleware: the first one, and the first after each server rebuild (the rebuild itself eagerly reloads only `main.server.mjs`, so it doesn't refill the slot). With live reload (the default), the page reload after a server edit is that request, so the new page's channels reach the new module; with `--live-reload=false`, or for an upgrade before any page request since the rebuild, the previously loaded module answers until a page request loads the new one. Channels already open stay on the code they started with. With the slot empty it writes `503`, `text/plain`, `Connection: close` and a short body, after an `error` listener so a reset can't crash the dev server, and warns once per serve run naming `createUpgradeHandler`. A request whose socket exposes no server passes through with one warning that channels aren't forwarded. Upgrades before the dev server's first request aren't forwarded (a browser always loads the page first). The slot key lives in its own internal module, so the builder reads it without loading `ws`.

**Hosts.** Tested on the built Node server and under `ng serve` with Vite's HMR socket still connected, in Chromium, Firefox and WebKit, including the dev-server reload behavior above. Not tested: `handleUpgrade` on Deno and workerd (including workerd's `bufferedAmount`), and the sizing of the default payload limit. HTTP/2 websockets (RFC 8441) aren't enabled by Node's `http2` by default; browsers fall back to HTTP/1.1. Hono's `@hono/node-server` needs its own upgrade wiring and isn't covered.

Not provided: automatic reconnection or resume, acknowledgements, sharing one socket between calls, binary frames, TanStack options for channels.

## TanStack Query integration

Optional, behind the generation option `tanstackQuery` (default `false`). Off, generated output is byte-identical to output without the option. The supported adapter is `@tanstack/angular-query` `^5.0.0-rc.5`, an optional peer dependency; the root entry point and `_generated` never import it.

Entry points:

- `@loozo/angular-launch/tanstack-query` (public): `provideLaunchQueries(): EnvironmentProviders` and `type RpcQueries<typeof group>`.
- `@loozo/angular-launch/_tanstack-query` (generated code only, not API): `createQueries(rpc, metadata)`.

With the option on, each `rpc.generated.ts` also exports `type Queries = { readonly <namespace>: RpcQueries<typeof group> }` and `injectQueries(): Queries`, which calls `createQueries(injectRpc(), …)` with literal `{ kind, input }` metadata per procedure. `injectQueries()` runs in an injection context, injects TanStack's `QueryClient` and throws, on every platform, when `provideLaunchQueries()` is missing. The core client is unchanged.

Surface per group: `$key()`. Per query procedure: `queryOptions(input | skipToken, overrides?)` with input, `queryOptions(overrides?)` without, and `key(input?)`. Per mutation procedure: `mutationOptions(overrides?)` and `key()`. Query and mutation options exist only on their own kind. `$` can't occur in Launch identifiers, so `$key` can't collide.

```text
$key()            ["launch", namespace]
key()             ["launch", namespace, procedure]
key(input)        ["launch", namespace, procedure, input]   input as the caller passed it
queryOptions(…)   the full key, DataTag'd with the procedure's awaited output; skipToken: no input
mutationOptions   mutationKey = key()
```

Generated options:

- `queryFn: ({ signal }) => callable(input?, { signal, transferCache: false })`, respecting no-input arity; `skipToken` input gives `queryFn: skipToken`. `mutationFn` calls `callable(input)` or `callable()`; variables are the caller input, or `void`.
- `retry: (failures, error) => !(error instanceof RpcError || error instanceof RpcRedirect || error instanceof RpcNotFound) && <QueryClient default retry for the query's key>`, resolved per call in query-core's merge order (`getDefaultOptions().queries`, then `getQueryDefaults(queryKey)`). A boolean default applies as is, a number retries while `failures < n`, a function is called with `(failures, error)`, and `undefined` retries while `failures < 3`. So the server keeps the adapter's `retry: false`, and an `RpcError` or outcome never retries.
- `refetchOnMount: (query) => hydrating ? false : <QueryClient default for the query's key, else true>`.
- Overrides replace any default but can't replace the key or the query or mutation function (omitted in the types; applied last at runtime). TError is `unknown`: callers narrow with the callable's `isError`, and the rejection is the callable's own.

Hydration is TanStack's: it dehydrates successful queries into `TransferState` during server rendering and hydrates its browser client before components run. Generated query calls opt out of Angular's HTTP transfer cache, so payloads appear once; direct calls keep the transfer cache. Errors aren't dehydrated: a query that fails during server rendering runs again in the browser.

`provideLaunchQueries()` owns one hydration window per application. It is open in the browser from bootstrap and closed on the server. An `APP_BOOTSTRAP_LISTENER` awaits `ApplicationRef.whenStable()` and then closes it, the hook Angular's HTTP transfer cache uses. The wait must not start from a provider factory, an environment initializer or lazily on first injection: those resolve before bootstrap registers pending work, so the window closes before the first page mounts and every load refetches. With the window, `staleTime: 0` renders server data first with no load-time RPC, and queries mounted after stability follow the client's defaults. The window also opens in a browser app without server rendering: an empty query loads regardless, but one with `initialData` or a pre-seeded cache entry doesn't refetch on mount until first stability.

The `QueryClient` is TanStack's, created per injector by `provideTanStackQuery`'s factory, so each server render has its own cache. Launch owns no client.

Optimistic updates and invalidation are TanStack's own: generated options carry no `onMutate`, `onSettled` or invalidation targets, and Launch owns no `MutationCache`. The guide documents both with the generated keys: per-mutation `invalidateQueries`, an app-wide `MutationCache` `onSettled` that invalidates `["launch"]` once no write that hasn't reached `onSettled` is pending (an `isMutating() > 1` check loses the read when two writes in different scopes settle together), and `onMutate`/`onError` rollbacks driven by the callable's `isError`. Not Launch API: generated invalidate/`setData` helpers, which save one argument per call and re-expose TanStack's filter options, and mutation-declared invalidation targets, which tie server definitions to the client cache and would need Launch to own the settle policy. Declared targets are worth revisiting when a consumer's writes affect other groups' queries and invalidating every active Launch query measurably over-fetches.

Not provided: infinite queries, error dehydration, persistence, `@tanstack/angular-query-experimental`, mutation cancellation and `@defer`-specific handling.

## Generation and builders

Launch owns one coordinated generation lifecycle, then delegates to the official Angular builders and dev server. It has no second runtime graph, generic plugin framework or competing watchers.

Generation runs the router's generation through its closed Node-only `@loozo/angular-router/_generation` seam, which recognizes Launch declarations only in combined generation mode. Launch reuses the router's route tree and artifact plan and validates one final overlay before publication. Standalone router generation is unchanged: it rejects scanned Launch defaults and doesn't clean Launch-owned outputs.

The router owns `route.generated.ts`. Launch owns `rpc.generated.ts`, context registration and server/client metadata, replaces or removes only its own marked outputs, and removes stale ones. Publication is individual writes, not an atomic transaction against crashes or concurrent writers.

Before any cold, update or check publication, strict semantic and provenance checks cover genuine `defineContext` / `defineRpc` provenance, the builder-callback shape and declared error schemas. Semantic checking covers generation's own domain: generated outputs, discovered route and Launch declarations, and application TypeScript files that directly import a generated output (static import, `export … from`, `import()`, `import()` type or `import =`). Other application files and dependencies get no semantic diagnostics here (the application's own build reports them); source syntax, module-reference and provenance checks still run before publication. The effective TS 6 `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `strictBuiltinIteratorReturn`, `noImplicitThis` and `useUnknownInCatchVariables` must be on, with `noCheck` off. Explicit or inherited false overrides are rejected even with `strict: true`; TS 6 defaults and explicit per-flag true overrides are accepted, without rewriting consumer configs. Literal error maps can't contain duplicate, reserved or invalid codes, invalid fields or nonconcrete schemas. The registered kind, not an authored field, supplies browser metadata and rendering denial. Exactly one genuine default context is allowed across the application's TypeScript roots, and local and ancestor RPC availability follows real route ancestry.

Launch ships two Angular CLI builders that own that lifecycle, adapted from the router's builders rather than shared through its seam:

- `@loozo/angular-launch:application`: the Launch generation options (`tsconfig`, `scanDirectories`, `outDirectory`, `tanstackQuery`, `check`) plus every `@angular/build:application` option. Its schema is generated from the installed `@angular/build` schema (peer `~22.2.0`) and committed; a test fails when it's stale. It validates options, rejects `watch: true`, runs `generate()` once and then schedules `@angular/build:application` with every other option unchanged. A generation failure, including `check: true` drift, is logged and fails the build before Angular's build runs; check mode writes nothing.
- `@loozo/angular-launch:serve`: `@angular/build:dev-server` options plus `poll` (default 1000 ms, forwarded to the dev server, because Angular 22.2's native watcher misses edits inside renamed directories). It reads the generation options from its `buildTarget`, which must use the Launch application builder and must not resolve `check: true`. It uses one generation session: the initial pass must succeed before the dev server starts, otherwise it reports `{ success: false }` without starting it. A watcher on the scan directory and the discovered context file (followed when it moves, since its path and contents feed the app identity) triggers sequential passes. A pass starts once changes have been quiet for 150 ms, so a save of several files or a directory rename runs one pass; changes during a pass cause one more, and running one more once its own watcher of a context file outside the scan directory is ready, since the pass that found it read it unwatched; a move through a missing or broken context (delete-then-create, or broken at its new path) is picked up only on the next scan-directory change or a restart; events for its own marked `route.generated.ts`/`rpc.generated.ts` are ignored. A failed later pass is logged and serving continues; the next change retries. The dev server runs through `executeDevServerBuilder` from the `@angular/build` the workspace resolves (as Architect resolves `@angular/build:dev-server`), not `scheduleBuilder`, so it can take the channel-forwarding middleware (§Channels); its options are first validated and defaulted against that builder's schema with `context.validateOptions`, and its outputs are forwarded as the builder's. Risk: Angular 22.2 marks `executeDevServerBuilder` `@experimental` and its `extensions` (middleware) as not supported, so an Angular update can break serving. Angular adds its own teardowns (closing Vite's server, aborting the build's watch) to the context it runs in, and Architect runs a context's teardowns only on a Stop, so the dev server gets a copy of the context whose `addTeardown` collects them, and the builder's stop runs them once whether Architect stops it, the dev server fails or it ends on its own. Teardown closes the watchers, runs those teardowns, ends the dev server's iteration and disposes the session; a dev server that fails errors the builder, and one that ends on its own completes it. The context-file path reaches the builder internally; the public generation API is unchanged.

## Exclusions

Each section above names what it leaves out. Across the package, Launch doesn't provide:

- Storage adapters or durability across server restarts; persistence is the handler's job.
- Production authentication, CORS, caching or deployment policy. HTTP RPCs are host-checked and refused unless proven same-origin (§HTTP request checks); there's no CSRF token scheme.
- Enforcement of the browser/server module boundary beyond what generated facades import (§Generated client).
- Blocking initial navigation, until its planned fix (§SSR, hydration and prerendering).
- Tested support for hosts and runtimes other than those §Streams and §Channels name.

## Decided limitations

Decided on 2026-11-13, before 0.1. Not planned:

- **Success statuses other than 200.** A result is always 200; statuses come from failures and outcomes (§Outcomes). Only things watching the wire would see a 201 or 204, and a 204 would need an empty-body rule for results.
- **Mapping `FORBIDDEN` to a page.** Middleware that guards a page's reads throws `redirect` for a signed-out visitor and `notFound` for something the visitor mustn't see (§Outcomes). A page that must answer 403 isn't covered: redirecting to a page shows it, without the status.
- **Redirects that leave the app.** `redirect` and `RpcRedirect.to` stay root-relative. An external destination, such as the start of an OAuth flow, is a mutation's result that the page passes to `location.assign`; mutations don't run during rendering, and outcomes act only in navigation.

Planned before 1.0, each needing its own design approval:

- **A cookie reader**, `readCookies(request)` from `/server`. It reads the request's `Cookie` header, so it doesn't see cookies set earlier in the same render (§Response control).
- **Blocking initial navigation**, through the `finishLaunchRendering` fix above.
- **Unified route declarations**, replacing one context per application (§One application context) and one RPC group per route (§Authored application): one `route.ts` per route, declared with Launch's `defineRoute`, whose `server` key holds the route's context stage, middleware and RPC groups keyed by namespace. Generation emits the browser copies, without the server parts. Several group files per route aren't planned separately; namespace-keyed groups cover them.
