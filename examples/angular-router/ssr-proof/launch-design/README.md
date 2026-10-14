# Angular Launch design proof

A bounded todo consumer and native Angular/TypeScript feasibility proof for [the design](../../../../specs/angular-launch.md). Not a framework implementation, generator, package or production deployment server.

## Contents

- `type-proof/`: type-only proposed API and strict authored/generated-shape consumers. No declarations here are executed. Standard Schema V1's structural interface is represented without a runtime validation-library dependency.
- `src/`: real native Angular SSR/hydration app. The server-only HttpBackend performs local dispatch; the browser uses ordinary HTTP. Generated-shape facades and the dispatcher are handwritten fixtures, not evidence of discovery or code generation.
- `verify.mjs`: real HTTP and Chromium assertions, retaining raw SSR HTML, transfer-state observations, failure payloads, cancellation evidence and a screenshot in an explicitly supplied absent directory.

Dependencies resolve normally from the enclosing handwritten router SSR proof. This adds no dependency, workspace entry, lockfile change, loader/compiler adapter or symlink. Use the repository's existing genuine installation and Node 24.21.0 / pnpm 12.9.1. The verified dependency version is Angular 22.2.2 / TypeScript 6.0.3.

## Commands

From this directory:

```sh
node ../../../../node_modules/typescript/bin/tsc -p type-proof/tsconfig.json
node ../../../../node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit
node ../node_modules/@angular/cli/bin/ng.js run launch-proof:build
node dist/launch-proof/server/server.mjs
# Server reports PROOF_READY http://127.0.0.1:PORT.
node verify.mjs http://127.0.0.1:PORT /absolute/owned/absent-evidence-directory
```

The private server binds loopback, uses in-memory todos and **test-only** `proof-user` cookies/diagnostics. It is not authentication, authorization or deployment guidance. Stop it after verification. The browser app invokes only the declared test dispatcher; external HTTP is not part of the tests.

Native build/cache outputs stay in this fixture's `dist/`, `.angular/` and `out-tsc/` locations. The verifier writes only its new supplied evidence directory and mutates the running proof server's in-memory rows. `pnpm run` scripts are convenience equivalents, with `verify` requiring URL/evidence arguments.

Expected-failure prerender check:

```sh
node ../node_modules/@angular/cli/bin/ng.js run launch-proof:build:prerender
```

This uses a genuine native file replacement and separate output path. The corrected result is a failed build, a clear live-context diagnostic and no successful prerender page—not a fabricated context or blank successful page.

Ordinary static prerendering remains supported:

```sh
node ../node_modules/@angular/cli/bin/ng.js run launch-proof:build:static
# dist/static-supported/browser/static/index.html contains the static page.
```

## What the proof does and does not claim

Type checks cover awaited context inference, schema input-versus-transformed-output inference, explicit group/procedure guard arguments, JSON-safe sample outputs, declared error factories and client narrowing, required input/options positions, and query/mutation literal metadata. Deliberate type negatives use `@ts-expect-error`; a missing rejection fails the check.

Native checks target direct execution without loopback HTTP, concurrent user/context isolation in DOM and transfer state, native hydration preserving the SSR list Node without an RPC POST, real post-stability requests, mutation persistence into subsequent SSR, validation-before-guards, public-error mapping, render-time mutation rejection, client cancellation without claiming server rollback, non-JSON output parity and browser build closure.

The SSR backend normalizes the same JSON envelope as HTTP. Only its own-origin registered endpoints dispatch locally; non-RPC traffic delegates to FetchBackend. Marked requests with mismatched origin/method/content type or explicit outgoing auth overrides fail rather than silently selecting different credentials. Query outputs intentionally transfer to their authenticated user's private HTML; no context is serialized. This proof does not globally opt into caching auth/credential/private responses.

The initial native prerender attempt logged the missing-context error but exited 0 and omitted the page. `render-faults.server.ts` now records that fault in the render-local application injector. The server bootstrap awaits native stability and rethrows it so the worker/build fails. Static rendering with no RPC leaves the record empty and succeeds. This does not patch Angular or invent build context.

The native build also separates server-entry and rendering bundles; module-local in-memory stores were not the same instance across those entry points. The proof database and metrics therefore travel through the passed request context, as application dependencies should, rather than relying on shared module singletons.

Strict JSON encoding is a feasibility subset, not the finalized undefined/optional/void contract. Public error schemas and generated metadata are demonstrated by types; the runtime fixture hardcodes the sample payloads rather than implementing generic error-schema validation. No claim is made about arbitrary schema vendors, producer-generated types, route scanning/scope/collision validation, build/watch coordination, package publication or production CSRF/CORS/deployment policy.

## Verification results

Verified on Angular 22.2.2 / TypeScript 6.0.3 / Node 24.21.0 (first verified on 22.1.5; the type checks, builds, `verify.mjs`, prerender and static checks were rerun after the 22.2 upgrade, which only changed the verifier's metafile path to `browser-stats.json`):

- Strict type-only API consumer and native application typecheck: pass.
- Official Angular production SSR build: pass.
- `verify.mjs`: all 12 HTTP/native Chromium check groups pass, including transfer-cache opt-out, request isolation, original DOM identity, post-stability requests, persistence, errors, cancellation and browser metafile closure.
- Unsupported prerender RPC: corrected native build exits 1 with the live-context diagnostic; no prerender page is emitted.
- Static page without RPC: native build exits 0 and emits the expected page.
- Explicit task-owned Oxfmt/Oxlint checks: pass.

Final runtime evidence: repository `.scratch/angular-launch-design-proof-20261011/native-reviewed-03/`. Native build/type logs are `types-reviewed.log`, `build-reviewed.log`, `prerender-reviewed.log` and `static-reviewed.log` in its parent. The earlier successful-exit prerender attempt is preserved as `prerender-final.log` / `.exit`; it is evidence of the problem, not a passed contract. Preliminary native results are kept separately.

Final source review and read-only adversarial findings are recorded with the task evidence. This remains the bounded proof described above; future framework/build-security requirements are not declared complete.
