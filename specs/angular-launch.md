# @loozo/angular-launch — initial design

Status: agreed design, preserved feasibility proof, and implemented bounded `todos.list` / `todos.add` / `todos.complete` package slices with declared typed errors. This is not a completed framework, authorization for the entire design, or a release contract. The first consumer is a boring personal todo list. Broader route examples below remain design examples, not implemented application features.

Launch builds on `@loozo/angular-router`, the official Angular toolchain and `@angular/ssr`. There is one route tree, one rendering system, and no RPC-specific tree.

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

The filenames above are organizational examples. Discovery authenticates imported `defineContext` and `defineRpc` identity statically, like the router's existing declaration discovery, and recognizes `query` / `mutation` / `stream` as the bindings of `defineRpc`'s builder callback. It does not execute authored modules. A default `defineRpc()` declaration is associated with its colocated discovered route declaration. The bounded slices support one group per retained ordinary route owner; multiple groups per owner are rejected.

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

Exactly one definition per application; a fresh value per live request. Global means application-wide typing, not mutable singleton request state. There is no context inheritance and no synthetic prerender request.

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

- `defineRpc` is the group discovery marker. Its second argument is a builder callback: an arrow function whose single parameter destructures `query` and/or `mutation` without renames, defaults or rest, and whose body is a parenthesized object literal of procedures, each a direct call of one of those bindings with one inline options object. The binding name gives the kind; there's no `kind` field in authored config. Procedure option keys are `handler`, `input`, `use` and `errors` for all three kinds; the only group option key is `use`. Generation doesn't read `use` contents; TypeScript checks them.
- Namespaces prevent procedure-name collisions. Each namespace is unique across the app, because it names the group on the wire (§Wire identity); a duplicate anywhere is a generation error.
- The existing route tree determines available groups: local plus ancestor groups, including pathless nodes. No sibling/descendant traversal API is required.
- Availability is not authorization. An HTTP caller who knows another group's identity still encounters that group's middleware.
- Middleware is explicit on a group (`defineRpc`'s `use`) and/or a procedure (its `use`); it doesn't inherit through route ancestry. Because the group's procedures are built inside its callback, a procedure can't miss its group's middleware, and handlers are typed with what it adds. There's no dedupe: middleware listed on both runs twice.
- A call runs: group middleware with no input (`input` is `undefined`), input validation, procedure middleware with the validated input, then the handler. Group middleware therefore refuses an unauthenticated caller with `FORBIDDEN` before its input is validated.
- `middleware(run)`: `run` receives `{ context, input, request, signal, response, next }`. `next()` or `next(added)` continues the call, merging `added` into the context by spread (the context must be a plain object), and resolves to an opaque token `run` must return; it rejects when anything after it throws, so middleware can wrap the rest of the call. Calling `next` twice, or returning anything other than its result, fails the call with `INTERNAL`, logged. Middleware and handlers see `context` as read-only at the top level (type-only; the object isn't frozen), so changes go through `next()`. A middleware needs the registered `Context` and `unknown` input unless its argument is annotated `MiddlewareArgs<Needs, Input>`. Each `use` entry must accept the context and input accumulated before it, and handlers see the final context; a misfit fails type checking on the offending entry. Group-level input is `unknown`, so a middleware that needs input only fits on a procedure.
- `forbidden()` returns an `Error` branded with a non-enumerable `Symbol.for("@loozo/angular-launch/outcome/v1")` property, which survives duplicate module copies in the entry and render bundles and can't come from JSON. Thrown from middleware or a handler it becomes the `FORBIDDEN` frame. `notFound()` and `redirect(to)` carry the same brand (§Outcomes). Declared errors stay handler-only; anything else thrown becomes `INTERNAL`.
- Handlers receive `{ context, input, errors, request, signal, response }` (§Response control). `request` is the live request the call runs in: the scope's copy of the RPC HTTP request, or the page request during rendering. Middleware runs during rendering too, so request-shaped checks (method, `Sec-Fetch-Site`) don't belong in middleware.
- There are no Launch resolvers, inherited resolver data, or RPC `parent` references. Fetch data with ordinary typed functions in handlers. Native Angular route resolvers remain available.
- Route params/search values are explicit procedure inputs, never automatically bound or trusted.

## Validation, values and errors

Input uses Standard Schema V1. The caller supplies the schema's input type; procedure middleware and handlers receive its validated/transformed output. Async validators are supported. Launch does not choose a schema library or invent a schema system. Schemas remain server implementation values unless the app independently imports them.

Results and transmitted inputs are strict JSON-safe. Direct SSR and HTTP apply the same encoding and decoding, not raw server values on only one path. Dates require explicit conversion. Undefined/void, nonfinite numbers, custom prototypes, sparse arrays and cycles are rejected rather than silently advertised as client DTOs. Optional/undefined output fields must be converted to an explicit JSON shape.

Public errors are implemented as procedure-local inline literal declarations: identifier code, nonempty literal message, integer literal status 400–599 and explicit concrete Standard Schema data (including `Schema<null>` for no data). A handler's inferred `errors.NOT_FOUND()` accepts schema input and synchronously creates a throwable, **not** already-validated public data. Shared dispatch awaits validation/transformation and strict-JSON-checks the schema output before publishing. The actual registered procedure owns the factory-failure identity and original declaration, including across native entry/render module duplication. Foreign factory failures, lookalikes, plain exceptions, schema issues/throws and non-JSON schema results produce generic `INTERNAL` and server-only diagnostics.

Input validation failures are field-addressable. `INVALID_INPUT` carries `InvalidInputData` (`{ issues: readonly InputIssue[] }`, both root exports), where each `InputIssue` is exactly `{ path: readonly (string | number)[], message: string }`. Dispatch normalizes the input schema's Standard Schema V1 issues in order: a path segment may be a property key or a `{ key }` segment; strings and finite numbers are kept; an issue with a symbol or any other unrepresentable segment gets the root path `[]` and is never stringified into an invented field. Only path and message are published, never vendor issue fields, input values or stacks, so input schema messages are public and written for users. Malformed requests and envelopes (such as a wrong method, media type or query string, non-JSON bodies, envelopes other than exactly `{ input }`, non-null input without a schema) carry `{ issues: [] }`. Direct SSR and HTTP publish identical issues. `FORBIDDEN`, `RPC_NOT_FOUND` and `INTERNAL` keep `null` data. Group middleware precedes validation, so a caller it refuses can't probe input schemas; procedure middleware follows validation and receives the validated input.

**Approved unpublished migration:** the fixed endpoint lookup code changes from `NOT_FOUND` to `RPC_NOT_FOUND`, preserving 404 and `"RPC not found"`. Reserve `INVALID_INPUT`, `FORBIDDEN`, `INTERNAL` and `RPC_NOT_FOUND` against business declarations; the object-literal key `__proto__` is also unavailable. Business `NOT_FOUND` remains ordinary typed data. No origin discriminator or blanket reservation of normal business identifiers is added.

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

TypeScript has no checked exception parameter on `Promise<T>`; this design exposes error metadata/type guards rather than claiming automatic catch typing. Network failures, local cancellation and local encoding failures remain distinct from server business failures. The optional TanStack Query integration below consumes operation kinds, identity, results and error metadata without changing this client.

### Outcomes

`notFound()` and ``redirect(to: `/${string}`)`` from `/server` are thrown outcomes, branded like `forbidden()`, for a page that can't be shown. `redirect` accepts only a root-relative URL that resolves to the same origin, so `//host`, `/\host` and tab- or newline-smuggled forms throw `TypeError` at creation; `@loozo/angular-router`'s `createUrl` returns `` `/${string}` `` so its result type-checks. Dispatch turns them into frames on both transports: `redirect` is status 303 with exactly `{ redirect: { to } }` and no `Location` header (with a null location, fetch returns the response instead of following it), and `notFound` is status 404 with exactly `{ notFound: null }`. Only status 200 is a result: every other status carries a frame dispatch built itself, so a handler result shaped like a frame stays data, and the rendering backend emits `HttpErrorResponse` for every non-200 reply. They aren't framework codes: `RPC_NOT_FOUND` stays the missing-procedure failure, and business `NOT_FOUND` stays declarable. Wrapping middleware sees them as `next()` rejections, like declared errors.

Clients recognize an outcome frame by exact shape, strict JSON and its own status (and a root-relative `to`), and reject with `RpcRedirect` (with `to`) or `RpcNotFound`, root exports. They aren't `RpcError`s and aren't procedure-owned; `isError()` is false for them, and anything else stays the original error.

`rpcNavigationErrors({ notFound })` (root export, with `RpcNavigationErrorsOptions`) returns a handler for Angular's `withNavigationErrorHandler`, run in the router's injection context. A navigation whose guard or resolver failed with `RpcRedirect` returns `new RedirectCommand(router.parseUrl(to))`; during SSR the final URL then differs from the requested one, so Angular's server answers 302 to it. `RpcNotFound` sets `RESPONSE_INIT.status = 404` when provided and returns a `RedirectCommand` to `notFound` with `browserUrl` set to the navigation's URL, so the not-found page renders at the requested URL; Angular reads `RESPONSE_INIT` after the app is stable. Other errors return `undefined`, Angular's default. Outcomes act only in navigation: elsewhere, calls just reject. An app with its own navigation error handler calls the returned function from it. A server-rendered not-found page calls its procedure again during hydration, because only successful responses transfer; a redirect doesn't. Any other guard or resolver failure during SSR, or an outcome without the handler, leaves Angular without a successful navigation, so `angular.handle` returns `null` and the server's fallback answers, without the render's cookies (§Response control); mapping `FORBIDDEN` to a page is out of scope. The root entry imports `@angular/router` for this, now a peer dependency, so it needs `@angular/compiler` or the linker in Node, like `_generated`.

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

Server implementation modules/context are not runtime imports of browser facades. Actual browser dependency-graph verification must enforce the boundary; names or type-only imports alone are not a complete isolation implementation.

### Wire identity

The namespace is the group's wire identity. It is unique across the app, so the path doesn't depend on effective URLs, source location or scan order: pathless declarations can share URLs, and moving an `rpc.ts` doesn't change its procedures' paths. Registry lookup supplies the real operation kind; the caller cannot relabel a mutation as a query.

```http
POST /_rpc/<namespace>/<procedure>
Content-Type: application/json

{"input":{"id":"123"}}
```

The envelope keeps primitive schema inputs JSON-encoded consistently by HttpClient. Version stability and request/error payload limits remain implementation details to qualify, not a promised cross-version protocol.

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
- **Rendering.** When the call settles, whatever its outcome, the server backend appends its cookies to `RESPONSE_INIT`'s headers (Angular 22 creates them as `Headers`; other `HeadersInit` values are replaced by a `Headers` copy), so they reach the page response and a 302 Angular builds from the same headers; headers are dropped, so a page's headers don't depend on which queries ran. `RESPONSE_INIT` is injected optionally; without it, a call that set cookies fails with `INTERNAL`, logged. Every call in a render receives the same context value, created once from the page request, and the page request as `request`, so a cookie one call sets isn't visible to later calls in the render; Launch doesn't rewrite the `Cookie` header or recreate the context. A session refresh that should run once per render keeps a cell in the context (README §Cookies and headers); concurrent HTTP requests each have their own context, so the session store must tolerate concurrent refreshes anyway. A failed initial navigation (`angular.handle` returning `null`) discards `RESPONSE_INIT`, so the render's cookies are lost with the page; Launch doesn't hand them to the server entry. Angular 22.2.2's `renderAngular` awaits `whenStable()` and `handleRendering` then builds the page `Response` from `RESPONSE_INIT`, copying its headers before final serialization, so only calls that settle before the app is first stable deliver cookies; a call made during serialization (`BEFORE_APP_SERIALIZED`) succeeds but its cookies are lost. Launch doesn't detect that case.
- **Commit.** Effects commit when the response is produced: when the call settles, or for a stream when its handler returned its iterable (§Streams). After that `setCookie` and `deleteCookie` throw, and changes to `headers` are ignored, so a wrapping middleware's header after `await next()` reaches query and mutation responses and is ignored for streams.

## SSR, hydration and prerendering

```text
Generated callable → HttpClient → Angular interceptors/transfer cache → backend
  Server backend: direct dispatcher with current request context
  Browser backend: real HTTP request, fresh server context
```

A server-only backend adapter keeps Angular's public HTTP pipeline and PendingTasks tracking. It emits ordinary HttpResponse/HttpErrorResponse events. Direct backend execution must use the same validated JSON envelope, serialization and middleware/error pipeline as HTTP.

The live server request creates context and passes it to Angular's app engine. Angular exposes it via `REQUEST_CONTEXT` in the render-local application. SSR calls reuse that value; later browser HTTP calls create new context. Mutations through rendering transport are rejected with the fixed `FORBIDDEN` frame before any middleware, input schema, handler or writes. Both marked generated calls and unmarked local HttpClient calls use actual registry kind, without HTTP fallback or context recreation; caller relabeling or forced transfer-cache options cannot authorize a write. Manual server dispatch defaults to HTTP semantics and has an explicit final `'rendering'` mode. This is not a guarantee that arbitrary application code or external HTTP calls cannot write during rendering.

Middleware and handlers get an abort `signal`. Over HTTP it is the scope request's signal, a clone of the incoming request's, so it aborts when the host's `request.signal` does; Angular's Node `createWebRequestFromNodeRequest` signal doesn't abort once the body has been read, so the documented Node server entries link a signal that aborts when the response closes unfinished. During rendering it is `AbortSignal.any([pageRequest.signal, perCall.signal])`, where the per-call signal aborts when HttpClient unsubscribes before the call settled. Aborting is advisory: a handler that ignores it still finishes, and a write may already have committed.

Queries default to HttpClient transfer caching and preserve opt-out. Mutation options accept only `transferCache:false`; the generated helper forces false even for untyped callers. Matching requests during hydration reuse the transferred response without network. Angular disables this HTTP cache after browser stability; it is not an ongoing query cache. POST body, URL, method, response type and params must match. Auth/credential/noncacheable-header exclusions and origin mapping require deliberate handling. Only intentionally browser-visible DTOs transfer; request context never does. Personalized HTML must not be published through a shared/public cache.

Initial RPC is live-request-only. Native SSR and CSR are supported; ordinary static pages may prerender without Launch RPC. A prerender RPC invocation fails clearly. No build context is inferred from missing request context, and no fake request or empty fallback is supplied. Route discovery must remain distinct from live invocation.

The native proof exposed that Angular 22.1.5 can log a resolver error, return no rendered page and still report a successful prerender build. The approved mitigation is a render-local fault record: record unsupported-context invocation, await native ApplicationRef.whenStable() in the server bootstrap, destroy the application and rethrow the fault. This uses public APIs without patching Angular internals. The corrected native build exits nonzero for prerender RPC; an ordinary static page still prerenders successfully. This guard addresses unsupported-context faults, not every possible caught error in arbitrary application code.

## Streams

A `stream` procedure is a read that sends values while it runs. Its options are a query's; its handler returns an `AsyncIterable` of strict JSON values whose return type is `void` (a non-void return is a type error), normally written `handler: async function* (args) { … }`. Generation reads options through the router's `properties()`, which doesn't accept method shorthand, so `async *handler()` is rejected. Generated metadata carries `kind: "stream"`; `injectQueries()` omits streams, and `RpcQueries` has no key for them.

**Dispatch.** A stream runs the same pipeline as a query (group middleware, validation, procedure middleware, handler). In `"rendering"` mode it's refused with `FORBIDDEN` before any of it, as mutations are. Over HTTP, `dispatch` gets a `start` callback: once the handler returns its iterable, the iterator goes to `start` and the innermost middleware step awaits the stream's end, so `next()` resolves when the stream ends, or once the handler returned after its body was cancelled, and rejects with the handler's error. `handleRpc` races the call against `start`: a reply first is an ordinary JSON response with its status (host, method, origin, `RPC_NOT_FOUND`, middleware refusals, `INVALID_INPUT`, a handler that throws or doesn't return an iterable); a start first is a 200 `text/event-stream` response with `Cache-Control: private, no-store, no-transform`, `Vary: Cookie`, `X-Content-Type-Options: nosniff` and `X-Accel-Buffering: no`, plus the call's cookies and headers, which commit then (§Response control). An `async function*` handler's body runs after that commit, so it can't set cookies; middleware before `next()` or a non-generator handler can. The call's signal is `AbortSignal.any([scope.request.signal, cancel])`, where `cancel` aborts when the host cancels the body; the body stops when that signal aborts, also when it was already aborted on creation. Angular's `writeResponseToNodeResponse` cancels a body it's writing when the response closes, but skips an already closed response without touching the body, so a client that leaves while context creation or middleware runs is only noticed through the request's signal: the documented close-signal wiring is required for that case.

**Wire.** The request is the ordinary `POST` envelope; the client also sends `Accept: text/event-stream`. The body is pull-based (a slow reader pauses the generator) and consists of `event: value\ndata: <strict JSON>\n\n` per value, then exactly one `event: end\ndata: null\n\n` or `event: error\ndata: {"status":<n>,"error":{"code","message","data"}}\n\n` once the whole call, middleware included, settled, plus `: keep-alive\n\n` every 15 s. The error data is the reply's frame with its status, built by the same failure, declared-error and outcome rules: `{"status":<n>,"error":{…}}`, `{"status":303,"redirect":{"to":…}}` or `{"status":404,"notFound":null}`. An `async function*` handler's body runs only after the response started, so outcomes it throws always arrive this way; middleware and handlers that throw before returning the iterable answer with the ordinary 303/404 JSON response. A value that isn't strict JSON fails the call (`INTERNAL`) and returns the suspended iterator. When the signal aborts, the body stops writing and errors, the handler's in-flight step (if any) is awaited and `iterator.return()` called, which takes effect at the generator's next yield. The handler's part settles once that return does: rejected if the step threw (a `next()` that throws synchronously counts), otherwise resolved, so wrapping middleware never cleans up under a running handler and never misses its failure.

**Client.** A stream callable takes `(input?, { signal }?)` and returns an `AsyncIterable` of the yielded type; each `[Symbol.asyncIterator]()` sends a new request with `fetch` (not `HttpClient`: its requests are `PendingTasks` until they complete, and `FetchBackend` keeps every chunk). Iteration ends on `end`; events that arrived in the same chunk aren't delivered once the signal aborted; throws a procedure-owned `RpcError` for an `error` event or a recognized error response, `RpcRedirect` or `RpcNotFound` for an outcome event or response, an `AbortError` for the signal and a `TypeError` for transport failures, a response whose media type isn't `text/event-stream`, a malformed or unknown event or data that isn't JSON, or a body that ends without `end`; returning early aborts the request. The client injects `PLATFORM_ID` only when its groups have streams; on the server platform every iteration fails at once with a procedure-owned `FORBIDDEN` and no request. Interceptors don't apply.

**Reconnection.** None automatic and no resume: iterating again is a new call with a fresh context, middleware and handler. Handlers yield the current state first. EventSource's built-in reconnection was rejected because it can only `GET` without a body, and a same-origin `GET` carries no `Origin`, which the same-origin check needs on plain HTTP.

**Server rendering.** Streams never run while rendering and never enter the HTTP transfer cache. Pages render from a query and follow the stream after hydration; streams add no pending tasks, so an open stream doesn't hold stability, Angular's transfer cache or Launch's TanStack hydration window open.

**TanStack.** No generated options: TanStack's `streamedQuery` (query-core 5.104.3 exports it as `experimental_streamedQuery`) keeps a query fetching until the stream ends, and `@tanstack/angular-query` adds a pending task while a query is fetching, so an open stream query keeps the app from becoming stable (measured in Chromium and Firefox).

**Hosts.** Verified on the Node built server (through `writeResponseToNodeResponse`, with and without the close-signal wiring for a stream already being sent), under `ng serve` and with a platform-neutral build on Deno. Tailscale Serve uses Go's `httputil.ReverseProxy`, which flushes `text/event-stream` immediately (source-checked, not run). Websockets are a later slice.

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

Excluded: infinite queries, optimistic-update helpers, automatic invalidation, error dehydration, persistence, `@tanstack/angular-query-experimental`, mutation cancellation and `@defer`-specific handling.

## Build integration

Launch owns one coordinated generation lifecycle, then delegates to official Angular builders/dev-server. It needs a narrow Node-only router discovery/planning seam, not a second runtime graph, generic plugin framework or competing watchers.

The implemented closed Node-only `@loozo/angular-router/_generation` seam permits Launch recognition only in combined generation mode. Launch reuses the authoritative route tree/artifact plan, validates one final overlay before publication, and preserves standalone router behavior: standalone generation still rejects scanned Launch defaults and does not clean Launch-owned outputs.

The router continues owning `route.generated.ts`. Launch owns `rpc.generated.ts`, context registration and server/client metadata. Artifact publication is individual writes, not an atomic crash/concurrent-writer transaction. The seam, combined generation/check, exact ownership and stale cleanup are implemented and regression-tested. The consumer's actual browser graph is checked for server dependencies; this is not generic boundary enforcement.

Launch ships two Angular CLI builders that own that lifecycle, adapted from the router's builders rather than shared through its seam:

- `@loozo/angular-launch:application`: the Launch generation options (`tsconfig`, `scanDirectories`, `outDirectory`, `tanstackQuery`, `check`) plus every `@angular/build:application` option. Its schema is generated from the installed `@angular/build` schema (peer `~22.2.0`) and committed; a test fails when it's stale. It validates options, rejects `watch: true`, runs `generate()` once and then schedules `@angular/build:application` with every other option unchanged. A generation failure, including `check: true` drift, is logged and fails the build before Angular's build runs; check mode writes nothing.
- `@loozo/angular-launch:serve`: `@angular/build:dev-server` options plus `poll` (default 1000 ms, forwarded to the dev server, because Angular 22.2's native watcher misses edits inside renamed directories). It reads the generation options from its `buildTarget`, which must use the Launch application builder and must not resolve `check: true`. It uses one generation session: the initial pass must succeed before the dev server starts, otherwise it reports `{ success: false }` without starting it. A watcher on the scan directory and the discovered context file (followed when it moves, since its path and contents feed the app identity) triggers sequential passes, coalescing changes during a pass into one more, and running one more once its own watcher of a context file outside the scan directory is ready, since the pass that found it read it unwatched; a move through a missing or broken context (delete-then-create, or broken at its new path) is picked up only on the next scan-directory change or a restart; events for its own marked `route.generated.ts`/`rpc.generated.ts` are ignored. A failed later pass is logged and serving continues; the next change retries. Teardown closes the watchers, stops the dev server and disposes the session. The context-file path reaches the builder internally; the public generation API is unchanged.

There is no watcher debounce: one save can cause two passes.

## Feasibility proof and next boundary

Proof location: `examples/angular-router/ssr-proof/launch-design/`.

The proof uses handwritten generated-shape fixtures and a type-only API declaration. It checks specific native Angular and TypeScript seams, not package publication, factory scanning, route-tree generation, production authentication/deployment, exhaustive failure handling or framework completeness. Its loopback diagnostics and cookie identity are test-only.

The preserved proof did not change router implementation, package manifests, workspace lockfile or unrelated specs. The subsequent authorized read-only slice adds real package/workspace wiring and the narrow router seam; it does not replace or edit that proof.

Verification results for the original proof remain in its README and task-owned evidence.

## Implemented bounded slices

- `packages/angular-launch`: genuine `defineContext` and `defineRpc` with builder-callback `query` / `mutation` / `stream`, inferred JSON-safe clients, async Standard Schema validation for inputs and declared error data, typed group and procedure middleware with `forbidden()`, `notFound()` / `redirect()` outcomes with `RpcRedirect` / `RpcNotFound` and `rpcNavigationErrors()`, abort signals over HTTP and during rendering, response cookies and headers (cookies onto the page during rendering), fixed framework errors, strict wire encoding, HTTP host and same-origin checks, native HttpClient transport for queries and mutations, and server-sent-event streams over `fetch`.
- `examples/angular-launch`: authored todo reads/writes with producer-generated context registration, route-local facades and server metadata. Native SSR queries dispatch locally with one live request context; hydration reuses the original DOM/transfer response; subsequent reads and browser writes use HTTP.
- `/todo/$id` reads one todo through a `todo` group whose `get` throws `notFound()` for absent/foreign IDs; `rpcNavigationErrors` renders `/not-found` there with 404 during SSR and at the requested URL in the browser. The `session` and `todo` groups use `signInFirst`, which throws `redirect(createUrl(signIn, {}))` for visitors without a user, so a signed-out `/todos` answers 302 to `/sign-in`; the `todos` and `live` groups keep `signedIn` (`FORBIDDEN`).
- Labelled native add form trims titles to 1–200 characters. Complete idempotently sets owned rows true, returning declared `NOT_FOUND` for absent/foreign IDs without modifying either user's rows. The private in-memory store persists across browser refresh only, not server restart. Pending controls/status, readable completion and error feedback preserve failed input; successful writes explicitly invalidate the todos group, which reads the list again. No optimistic writes or automatic invalidation.
- Final strict semantic/provenance checks cover genuine `defineContext` / `defineRpc` provenance, the builder-callback shape and declared error schemas before any cold/update/check publication. Semantic checking covers generation's own domain: generated outputs, discovered route/Launch declarations and application TypeScript files that directly import a generated output (static import, `export … from`, `import()`, `import()` type or `import =`). Other application files and dependencies get no semantic diagnostics here (the application's own build reports them); source syntax, module-reference and provenance checks still run before publication. Effective TS 6 `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `strictBuiltinIteratorReturn`, `noImplicitThis` and `useUnknownInCatchVariables` must be on, with `noCheck` off. Explicit/inherited false overrides are rejected even with `strict:true`; TS 6 defaults and explicit per-flag true overrides are accepted without rewriting consumer configs or the router seam. Literal error maps cannot contain duplicate/reserved/invalid codes, invalid fields or nonconcrete schemas. Actual registered kind supplies browser metadata and rendering denial, not authored kind fields.
- Generated app identity plus a private per-request token bind scope to native Angular `REQUEST`, including proxy-sanitization clones and separate entry/render bundles. Server wiring must use `angular.handle(scope.request, scope)`. This catches pairing mistakes, not incorrect authentication or arbitrary server code.
- One genuine default context across application TypeScript roots; local/ancestor RPC availability follows real route ancestry. Names are ASCII identifiers; `__proto__` is reserved. Explicit schema expressions cannot contain absent/nullish branches.
- Optional TanStack Query integration (`tanstackQuery` generation option, `@loozo/angular-launch/tanstack-query`): the example's todos page reads through `injectQuery` and writes through `injectMutation` with group invalidation; native SSR dehydrates the query once, hydration with `staleTime: 0` makes no RPC, and a failed SSR query loads in the browser.
- Unsupported generated RPC prerender fails the native build, including for a page whose only RPC is an `injectQuery`; static no-RPC prerender succeeds. With no native request, unmarked foreign HTTP delegates normally; arbitrary unmarked absolute own-origin RPC cannot universally be classified.

The qualified consumer uses ordinary `provideRouter` with hydration. A fresh native Angular 22.1.5 source/function probe confirmed that **blocking initial navigation plus a root RPC resolver** can invoke RPC during route discovery without live context and fail. Ordinary root discovery did not invoke the resolver. Broader blocking-navigation support is parked, not claimed.

Original read-slice verification/review receipts live under `.scratch/angular-launch-read-slice/`. The next mutation/error slice is qualified against its seeded read-slice overlay, not initial Git HEAD; current receipts are supplied with that incremental checkpoint. This remains uncommitted and unpublished. Packed consumption qualifies paired unpublished Launch/router artifacts, not the registry's existing router version (which lacks the new seam).

Remaining scope: storage adapters/server-restart durability, websockets, optimistic writes, automatic invalidation, generic browser-boundary enforcement, broader compatibility and production auth/CORS/cache/deployment policy. HTTP RPCs are host-checked and refused unless proven same-origin (see HTTP request checks); there is no CSRF token scheme. No full framework or release approval is implied.
