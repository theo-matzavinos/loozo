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

The filenames above are organizational examples. Discovery authenticates imported factory identity statically, like the router's existing declaration discovery. It does not execute authored modules. A default `defineRpc()` declaration is associated with its colocated discovered route declaration. The bounded slices support one group per retained ordinary route owner; multiple groups per owner are rejected.

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
import { defineRpc, query, mutation } from "@loozo/angular-launch/server";
import { todoIdSchema } from "./todo-inputs";
import { isSignedIn, canCompleteTodos, requireUser } from "./auth";

export default defineRpc(
  "todos",
  {
    list: query({
      handler: ({ context }) => {
        const user = requireUser(context);

        return context.db.todos.listForUser(user.id);
      },
    }),

    complete: mutation({
      input: todoIdSchema,
      canActivate: [canCompleteTodos],
      errors: {
        NOT_FOUND: {
          status: 404,
          message: "Todo does not exist",
          data: todoIdSchema,
        },
      },
      handler: async ({ input, context, errors }) => {
        const user = requireUser(context);
        const todo = await context.db.todos.findForUser(user.id, input.id);

        if (todo === null) {
          throw errors.NOT_FOUND({ id: input.id });
        }

        return context.db.todos.complete(todo.id);
      },
    }),
  },
  {
    canActivate: [isSignedIn],
  },
);
```

- `defineRpc` is the group discovery marker; `query` / `mutation` express read/write semantics without a `kind` field in authored config.
- Namespaces prevent procedure-name collisions. Duplicate namespaces in one available ancestry scope are errors; unrelated branches may reuse names.
- The existing route tree determines available groups: local plus ancestor groups, including pathless nodes. No sibling/descendant traversal API is required.
- Availability is not authorization. An HTTP caller who knows another group's identity still encounters that group's declared guards.
- Guards are explicit on a group and/or procedure; they do not inherit through route ancestry. A call runs the owning group's guards and its own guards, independent of the calling page.
- Input validation precedes group guards, which precede procedure guards and then the handler. Initial guards return boolean/Promise<boolean>; false is the framework's forbidden failure. A guard does not magically narrow callback context types.
- There are no Launch resolvers, inherited resolver data, or RPC `parent` references. Fetch data with ordinary typed functions in handlers. Native Angular route resolvers remain available.
- Route params/search values are explicit procedure inputs, never automatically bound or trusted.

## Validation, values and errors

Input uses Standard Schema V1. The caller supplies the schema's input type; handlers and procedure guards receive its validated/transformed output. Async validators are supported. Launch does not choose a schema library or invent a schema system. Schemas remain server implementation values unless the app independently imports them.

Results and transmitted inputs are strict JSON-safe. Direct SSR and HTTP apply the same encoding and decoding, not raw server values on only one path. Dates require explicit conversion. Undefined/void, nonfinite numbers, custom prototypes, sparse arrays and cycles are rejected rather than silently advertised as client DTOs. Optional/undefined output fields must be converted to an explicit JSON shape.

Public errors are implemented as procedure-local inline literal declarations: identifier code, nonempty literal message, integer literal status 400–599 and explicit concrete Standard Schema data (including `Schema<null>` for no data). A handler's inferred `errors.NOT_FOUND()` accepts schema input and synchronously creates a throwable, **not** already-validated public data. Shared dispatch awaits validation/transformation and strict-JSON-checks the schema output before publishing. The actual registered procedure owns the factory-failure identity and original declaration, including across native entry/render module duplication. Foreign factory failures, lookalikes, plain exceptions, schema issues/throws and non-JSON schema results produce generic `INTERNAL` and server-only diagnostics.

**Approved unpublished migration:** the fixed endpoint lookup code changes from `NOT_FOUND` to `RPC_NOT_FOUND`, preserving 404 and `"RPC not found"`. Reserve `INVALID_INPUT`, `FORBIDDEN`, `INTERNAL` and `RPC_NOT_FOUND` against business declarations; the object-literal key `__proto__` is also unavailable. Business `NOT_FOUND` remains ordinary typed data. No origin discriminator or blanket reservation of normal business identifiers is added.

Generated browser metadata includes genuine kind and declared code/status/message only, not runtime schemas, handlers or context. Clients validate exact frame shape, strict JSON and known code/status/message, then associate converted `RpcError` instances privately with group/procedure ownership. Arbitrary `RpcError` instances and another procedure's failures do not pass `.isError()`. Schema output validation remains server-side; the browser does not reimplement schemas. `ClientRpcError<typeof group.procedures.complete>` and procedure-specific `isError()` narrow to a discriminated union of declared schema-output data plus fixed framework-null failures:

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

TypeScript has no checked exception parameter on `Promise<T>`; this design exposes error metadata/type guards rather than claiming automatic catch typing. Network failures, local cancellation and local encoding failures remain distinct from server business failures. A later TanStack integration can consume operation kinds, identity, results and error metadata; that adapter is not in initial scope.

## Generated client

Every retained route gets a separate colocated `rpc.generated.ts`, even without a local RPC group. Its parameterless `injectRpc()` binds the available groups statically by origin declaration. Angular DI supplies transport; the client does not inspect the active URL or require completed route activation.

```ts
import { injectRpc } from "./rpc.generated";

const rpc = injectRpc(); // Inside an Angular injection context.

await rpc.todos.list();
await rpc.todos.list({ signal });
await rpc.todo.get({ id: "123" }, { signal });
```

Callables return promises. Input procedures take input then optional call options; no-input procedures take optional options only. Client cancellation unsubscribes HttpClient and rejects with `AbortError`. Server work may continue; a cancelled mutation may already have committed. Server disconnect/handler signals are deferred.

Server implementation modules/context are not runtime imports of browser facades. Actual browser dependency-graph verification must enforce the boundary; names or type-only imports alone are not a complete isolation implementation.

### Wire identity

The ergonomic namespace is not globally unique. Generate deterministic opaque IDs from declaration/source identity, not effective URLs or scan order. Pathless declarations can share URLs. Registry lookup supplies the real operation kind; the caller cannot relabel a mutation as a query.

```http
POST /_rpc/<group-id>/<procedure>
Content-Type: application/json

{"input":{"id":"123"}}
```

The envelope keeps primitive schema inputs JSON-encoded consistently by HttpClient. Exact ID encoding/version stability and request/error payload limits remain implementation details to qualify, not a promised cross-version protocol.

## SSR, hydration and prerendering

```text
Generated callable → HttpClient → Angular interceptors/transfer cache → backend
  Server backend: direct dispatcher with current request context
  Browser backend: real HTTP request, fresh server context
```

A server-only backend adapter keeps Angular's public HTTP pipeline and PendingTasks tracking. It emits ordinary HttpResponse/HttpErrorResponse events. Direct backend execution must use the same validated JSON envelope, serialization and guard/error pipeline as HTTP.

The live server request creates context and passes it to Angular's app engine. Angular exposes it via `REQUEST_CONTEXT` in the render-local application. SSR calls reuse that value; later browser HTTP calls create new context. Mutations through rendering transport are rejected with the fixed `FORBIDDEN` frame before input schema, group/procedure guards, handler or writes. Both marked generated calls and unmarked local HttpClient calls use actual registry kind, without HTTP fallback or context recreation; caller relabeling or forced transfer-cache options cannot authorize a write. Manual server dispatch defaults to HTTP semantics and has an explicit final `'rendering'` mode. This is not a guarantee that arbitrary application code or external HTTP calls cannot write during rendering.

Queries default to HttpClient transfer caching and preserve opt-out. Mutation options accept only `transferCache:false`; the generated helper forces false even for untyped callers. Matching requests during hydration reuse the transferred response without network. Angular disables this HTTP cache after browser stability; it is not an ongoing query cache. POST body, URL, method, response type and params must match. Auth/credential/noncacheable-header exclusions and origin mapping require deliberate handling. Only intentionally browser-visible DTOs transfer; request context never does. Personalized HTML must not be published through a shared/public cache.

Initial RPC is live-request-only. Native SSR and CSR are supported; ordinary static pages may prerender without Launch RPC. A prerender RPC invocation fails clearly. No build context is inferred from missing request context, and no fake request or empty fallback is supplied. Route discovery must remain distinct from live invocation.

The native proof exposed that Angular 22.1.5 can log a resolver error, return no rendered page and still report a successful prerender build. The approved mitigation is a render-local fault record: record unsupported-context invocation, await native ApplicationRef.whenStable() in the server bootstrap, destroy the application and rethrow the fault. This uses public APIs without patching Angular internals. The corrected native build exits nonzero for prerender RPC; an ordinary static page still prerenders successfully. This guard addresses unsupported-context faults, not every possible caught error in arbitrary application code.

## Build integration

Launch owns one coordinated generation lifecycle, then delegates to official Angular builders/dev-server. It needs a narrow Node-only router discovery/planning seam, not a second runtime graph, generic plugin framework or competing watchers.

The implemented closed Node-only `@loozo/angular-router/_generation` seam permits Launch recognition only in combined generation mode. Launch reuses the authoritative route tree/artifact plan, validates one final overlay before publication, and preserves standalone router behavior: standalone generation still rejects scanned Launch defaults and does not clean Launch-owned outputs.

The router continues owning `route.generated.ts`. Launch owns `rpc.generated.ts`, context registration and server/client metadata. Artifact publication is individual writes, not an atomic crash/concurrent-writer transaction. The seam, combined generation/check, exact ownership and stale cleanup are implemented and regression-tested. The consumer's actual browser graph is checked for server dependencies; this is not generic boundary enforcement. Launch builder/watch/teardown orchestration remains unimplemented.

## Feasibility proof and next boundary

Proof location: `examples/angular-router/ssr-proof/launch-design/`.

The proof uses handwritten generated-shape fixtures and a type-only API declaration. It checks specific native Angular and TypeScript seams, not package publication, factory scanning, route-tree generation, production authentication/deployment, exhaustive failure handling or framework completeness. Its loopback diagnostics and cookie identity are test-only.

The preserved proof did not change router implementation, package manifests, workspace lockfile or unrelated specs. The subsequent authorized read-only slice adds real package/workspace wiring and the narrow router seam; it does not replace or edit that proof.

Verification results for the original proof remain in its README and task-owned evidence.

## Implemented bounded slices

- `packages/angular-launch`: genuine `defineContext`, `defineRpc`, `query`, `mutation`, inferred JSON-safe clients, async Standard Schema validation for inputs and declared error data, explicit guards, fixed framework errors, strict wire encoding and native HttpClient transport.
- `examples/angular-launch`: authored todo reads/writes with producer-generated context registration, route-local facades and server metadata. Native SSR queries dispatch locally with one live request context; hydration reuses the original DOM/transfer response; subsequent reads and browser writes use HTTP.
- Labelled native add form trims titles to 1–200 characters. Complete idempotently sets owned rows true, returning declared `NOT_FOUND` for absent/foreign IDs without modifying either user's rows. The private in-memory store persists across browser refresh only, not server restart. Pending controls/status, readable completion and error feedback preserve failed input; successful writes explicitly read again. No optimistic writes or automatic invalidation.
- Final strict semantic/provenance checks cover both genuine factory kinds and declared error schemas before any cold/update/check publication. Semantic checking covers generation's own domain: generated outputs, discovered route/Launch declarations and application TypeScript files that directly import a generated output (static import, `export … from`, `import()`, `import()` type or `import =`). Other application files and dependencies get no semantic diagnostics here (the application's own build reports them); source syntax, module-reference and provenance checks still run before publication. Effective TS 6 `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `strictBuiltinIteratorReturn`, `noImplicitThis` and `useUnknownInCatchVariables` must be on, with `noCheck` off. Explicit/inherited false overrides are rejected even with `strict:true`; TS 6 defaults and explicit per-flag true overrides are accepted without rewriting consumer configs or the router seam. Literal error maps cannot contain duplicate/reserved/invalid codes, invalid fields or nonconcrete schemas. Actual registered kind supplies browser metadata and rendering denial, not authored kind fields.
- Generated app identity plus a private per-request token bind scope to native Angular `REQUEST`, including proxy-sanitization clones and separate entry/render bundles. Server wiring must use `angular.handle(scope.request, scope)`. This catches pairing mistakes, not incorrect authentication or arbitrary server code.
- One genuine default context across application TypeScript roots; local/ancestor RPC availability follows real route ancestry. Names are ASCII identifiers; `__proto__` is reserved. Explicit schema expressions cannot contain absent/nullish branches.
- Unsupported generated RPC prerender fails the native build; static no-RPC prerender succeeds. With no native request, unmarked foreign HTTP delegates normally; arbitrary unmarked absolute own-origin RPC cannot universally be classified.

The qualified consumer uses ordinary `provideRouter` with hydration. A fresh native Angular 22.1.5 source/function probe confirmed that **blocking initial navigation plus a root RPC resolver** can invoke RPC during route discovery without live context and fail. Ordinary root discovery did not invoke the resolver. Broader blocking-navigation support is parked, not claimed.

Original read-slice verification/review receipts live under `.scratch/angular-launch-read-slice/`. The next mutation/error slice is qualified against its seeded read-slice overlay, not initial Git HEAD; current receipts are supplied with that incremental checkpoint. This remains uncommitted and unpublished. Packed consumption qualifies paired unpublished Launch/router artifacts, not the registry's existing router version (which lacks the new seam).

Remaining scope: Launch build/watch orchestration, storage adapters/server-restart durability, subscriptions, optimistic writes, automatic invalidation, generic browser-boundary enforcement, broader compatibility and production auth/CSRF/CORS/cache/deployment policy. No full framework or release approval is implied.
