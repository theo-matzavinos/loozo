# @loozo/angular-launch

Bounded **queries, mutations and declared typed errors** on Angular 22's native router, HttpClient and SSR.
No builder/native watcher, storage adapter, subscriptions, optimistic writes, automatic invalidation or production authentication/deployment policy.

Author one default `defineContext(request => value)` anywhere in the application's admitted TypeScript roots, and one default `defineRpc('todos', { list: query({handler: ({context}) => ...}) }, {canActivate: [...]})` per colocated retained route owner. Use ordinary `requireUser(context)` narrowing; guards do not narrow callback types. Group and procedure guards are explicit and never inherited. Namespace/procedure names are literal ASCII identifiers; only `__proto__` is reserved because ordinary object-literal semantics would lose that own key. `constructor` and `toString` remain supported.

Before the official `@angular/build:application` build:

```js
import { generate } from "@loozo/angular-launch/generation";
await generate(workspace, {
  tsconfig: "tsconfig.app.json",
  scanDirectories: ["src/routes"],
  outDirectory: "generated",
  check: false,
});
```

### Explicit generation sessions

An explicitly sequenced producer can own compiler reuse for one application lifetime:

```js
import { createGenerationSession } from "@loozo/angular-launch/generation";

const session = createGenerationSession(workspace, {
  tsconfig: "tsconfig.app.json",
  scanDirectories: ["src/routes"],
  outDirectory: "generated",
});

try {
  await session.generate();
  // The caller detects/serializes edits; the session does not start a watcher.
  await session.generate();
  await session.generate({ check: true });
} finally {
  await session.dispose();
}
```

Workspace access is bound to an absolute path at creation; config/scan/output options are fixed and the scan array is copied. Each call reparses current configuration, inventories files, authenticates factories/imports and validates the complete desired overlay before normal publication/check. `generate({check?}, stopped?)` has the same final nonpublishing stop behavior as cold `generate`; overlapping calls reject rather than queue/retry. Move a workspace itself by disposing and creating a new session at its new location. Moves within the application are ordinary edits.

Each session has separate discovery and overlay SourceFile caches. Text, effective compiler settings and per-file parsing inputs determine reuse; hosts, Programs and native module/type/library/package resolution caches are fresh each pass. Semantic diagnostic results are never cached across passes. Cached SourceFiles retain TypeScript's native binding data (including locals/symbols), but checker-owned resolution state and factory-authentication verdicts are not cached across passes. The router and Launch canonical anchors (the package declarations that `defineRoute` and the Launch factories must resolve to) are computed once per session and recomputed when the effective compiler options, the package type entry or any file the anchor read (including package metadata) changes. A new higher-priority module resolution candidate appearing mid-session is not detected; restart the session or dev server after changing dependencies. No application dependency graph or disk build-info cache is retained.

A rejected or stopped generation clears compiler state; repair uses fresh state and never needs a new session. `dispose()` closes immediately, suppresses an active call's final publication, waits for settlement and releases compiler references; it is idempotent and subsequent generation calls reject. It does not cancel synchronous compiler work or interrupt an already executing synchronous publication section. Independent sessions do not share compiler state; concurrent writers to the same outputs remain unsupported. Cold `generate`, the example CLI and `--check` remain stateless. This API does not qualify ordering with Angular's independent watcher or any native build/watch integration.

The application workspace has a named `package.json`. Its name, normalized config/context source identity and context source text determine the stable generated app binding (absolute relocation does not change it). Group IDs remain source-path-only. Generation runtime exports are explicitly Node-conditioned, with usable NodeNext types and no browser runtime default.

Include `generated/**/*.ts` (including declarations) in the app tsconfig. Generation statically discovers genuine named factory imports (aliases supported), reuses the router's authoritative explicit-parent tree and emits:

- Router-owned native routes/destinations/`route.generated.ts`.
- Launch-owned colocated `rpc.generated.ts`: parameterless `injectRpc()`, local and ancestor namespaces only, including pathless owners.
- `context.generated.d.ts`: application-local awaited `ContextOf` registration.
- `server.generated.ts`: real context factory/registry imports and `createContext`, `handleRequest`, `provideServer` bindings.

Call no-input procedures with optional options only, or schema-input procedures with caller input then options. An explicit `input` expression must have a concrete Standard Schema type, without absent/nullish branches; a schema whose caller input itself is a union (for example `Schema<string | number, ...>`) is supported. Standard Schema V1 validators may asynchronously transform input before guards and handlers. Ordinary and readonly DTO interfaces work without index signatures; caller input, transformed handler input and exact awaited results retain their original inferred types. Structural type constraints do not replace the strict runtime JSON check. All results are promises; `.kind` is literally `'query'` or `'mutation'` from the genuine factory. `.isError()` recognizes only client-converted failures owned by that group/procedure, not arbitrary `RpcError` instances or another procedure's business errors. Network/encoding errors and client `AbortError` remain distinct.

```ts
import { defineRpc, mutation, query } from "@loozo/angular-launch/server";

export default defineRpc(
  "todos",
  {
    list: query({
      handler: ({ context }) => context.db.todos.listForUser(requireUser(context).id, false),
    }),
    add: mutation({
      input: titleSchema,
      handler: ({ input, context }) =>
        context.db.todos.addForUser(requireUser(context).id, input.title),
    }),
    complete: mutation({
      input: idSchema,
      errors: { NOT_FOUND: { status: 404, message: "Todo does not exist", data: idSchema } },
      handler: async ({ input, context, errors }) => {
        const todo = await context.db.todos.completeForUser(requireUser(context).id, input.id);

        if (todo === null) {
          throw errors.NOT_FOUND({ id: input.id });
        }

        return todo;
      },
    }),
  },
  { canActivate: [isSignedIn] },
);
```

Declared errors use an inline literal map, identifier codes, integer literal statuses 400–599, nonempty literal messages and an explicit concrete Standard Schema `data` value. Use `Schema<null>` for no data. Factories accept schema **input** and synchronously create a throwable; they do not synchronously validate or expose public data. Dispatch awaits the schema, checks its transformed **output** as strict JSON, then publishes that DTO. Validation issues/throws/non-JSON results, lookalikes, ordinary exceptions and factories from another procedure/declaration become generic `INTERNAL`, with details only in server logs. Identity is attached to the actual procedure, including across native entry/render module duplication.

The browser facade contains code/status/message metadata only, never schema implementations. It checks exact error-envelope shape, strict JSON and known code/status/message; server schema validation supplies the trusted output contract. `ClientRpcError<typeof group.procedures.complete>` and `.isError()` discriminate declared output data from fixed framework `null` by code alone:

```ts
try {
  await rpc.todos.complete({ id });
  await rpc.todos.list(); // Explicit read after success; no automatic invalidation.
} catch (error) {
  if (rpc.todos.complete.isError(error) && error.code === "NOT_FOUND") {
    const missingId: string = error.data.id;
  }
}
```

**Unpublished migration:** fixed endpoint lookup `NOT_FOUND` is now `RPC_NOT_FOUND` (same 404 and `"RPC not found"` message). Only `INVALID_INPUT`, `FORBIDDEN`, `INTERNAL`, `RPC_NOT_FOUND` and the object-literal key `__proto__` are unavailable as business codes. Ordinary business `NOT_FOUND` is supported with its declared payload; there is no origin discriminator.

Both direct rendering and live HTTP use the same JSON envelope, validation → group guards → procedure guards → handler → strict JSON result pipeline. Strict JSON excludes Date, undefined/void, nonfinite numbers, functions, cycles, custom prototypes and sparse arrays; convert explicitly. Client `signal` cancellation unsubscribes HttpClient; server work may continue and a cancelled write may already have committed. No rollback is promised. Queries default to native transfer caching and may opt out with `{transferCache:false}`. Mutations always send `transferCache:false`; their options reject `true` statically and override it at runtime.

For native SSR, always pass the returned request as well as its scope:

```ts
const scope = await createContext(realRequest);
const result = await angular.handle(scope.request, scope);
```

Generated `appBinding` carries the app identity/context factory to `createRequestScope(appBinding, request)`, `handleRpc(registry, appBinding, request)` and `provideLaunchServer(registry, appBinding)`. There is no unbound factory-only fallback. A fresh private token on the cloned request links the scope to native Angular `REQUEST`; the `Symbol.for` scope brand still works across separate entry/render bundles. Angular may strip untrusted proxy headers and clone that request; its non-proxy private binding header survives. The original body remains usable, native signals remain linked and context is created once. Mismatched request/scope/app bindings produce generic INTERNAL before guards/handlers and log a server diagnostic. The header is server-internal, not a browser RPC protocol. This detects integration mispairing, not arbitrary bad server code, a wrongly chosen factory/user, authentication or context-payload validity. Install generated `provideServer()` after `provideHttpClient()` in the render application. Context dependencies travel in that scope, not module-local server singletons. Use `finishLaunchRendering(app)` in server bootstrap after `bootstrapApplication` so unsupported prerender RPC fails the native build rather than becoming a swallowed resolver failure. Ordinary static pages without RPC remain supported.

The qualified hydrated consumer uses ordinary `provideRouter`. Blocking initial navigation with a root RPC resolver can invoke RPC during native route discovery without a live request and fail; that broader configuration is not qualified. With no native `REQUEST`, marked generated RPC and relative/local-to-synthetic-origin RPC fail; unmarked explicit foreign absolute/protocol-relative HTTP delegates. This cannot identify every unmarked absolute own-origin RPC without a live origin.

The server final backend delegates non-RPC traffic to FetchBackend, dispatches live local RPC directly (including unmarked requests), and rejects marked foreign targets, invalid method/MIME and outgoing credential overrides. Effective URLs use native `urlWithParams`; params added by interceptors cannot disappear from direct checks/response URLs. Actual registry mutations through this rendering backend are denied with the fixed `FORBIDDEN` frame before input validation, guards, handlers or writes, for both generated/marked and unmarked local calls, without new context or HTTP fallback. Caller labels and cache options do not authorize rendering writes. Manual server `dispatch` defaults to HTTP semantics; pass the final mode `'rendering'` to explicitly enforce rendering denial. Native interceptors, pending tasks, transfer cache and hydration stay upstream. No broad auth/credential/private-response cache opt-in is enabled. Only browser-visible DTOs transfer; personalized HTML needs private/no-store headers.

Every generated context/group payload import (registration, registry and facade types) must natively resolve to the exact discovered file/default binding, including under module suffix policies; compatible structural replacements are not accepted.

`generate(..., stopped)` validates a final strict overlay before its one combined publication/check. It checks generation's own domain with `skipLibCheck:false`: syntax, semantic and (with `declaration` or `composite`) declaration diagnostics of every generated output, every discovered route/Launch declaration and every application TypeScript file that directly imports a generated output (static import, `export … from`, `import()`, `import()` type or `import =`), plus compiler option and global diagnostics. Other application files (such as files that reach generated outputs only through re-exports) and dependencies get no semantic or declaration diagnostics here; the application's own build reports those. Source syntax, module-reference and provenance checks still cover all admitted application files before publication. Launch requires the **effective TS 6 checking flags** `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `strictBuiltinIteratorReturn`, `noImplicitThis` and `useUnknownInCatchVariables` to be enabled, and rejects `noCheck:true`. An explicit or inherited false is not overridden by `strict:true` alone. TS 6's default strict checking and explicit per-flag true overrides are accepted; configs are never rewritten. This gate applies before cold/update/check publication, including unsafe schema outputs that weakened null/any checking could otherwise admit. `alwaysStrict` is no longer a strict checking flag in TS 6; this is not a new configuration platform. It preserves byte-identical outputs and mtimes, rejects unmarked collisions/symlinks/escapes and removes only exact Launch markers/basenames in closed Launch mode. Individual writes are **not** an atomic crash/concurrent-writer transaction. Output ID identity is a versioned hash of normalized app-relative source identity, independent of namespace/method/URL/absolute relocation; source renames change IDs.

The paired packed check accepts an absolute absent evidence directory: `node packages/angular-launch/tests/packed.mjs /absolute/new-evidence`. Its consumer, pnpm store/state/cache and temporary files live under that owned directory.

See `examples/angular-launch` for the genuine generated todos consumer and native verification. Its cookie identity, diagnostics and in-memory data are loopback-only tests, not security/deployment guidance.
