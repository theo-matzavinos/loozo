# Origami UI — independent acceptance preparation

**Status: handwritten public consumer seeds and explicit case definitions against the contract frozen on 2026-10-11; no product-library or browser qualification yet.**

**Version status (2026-10-14):** the library and its acceptance suite are implemented; these seeds are executed by [`tests/acceptance`](../tests/acceptance/README.md), which now runs on Angular 22.2.2. The 22.1.5 statements below are the dated seed-time research.

The Popover design/API/lifecycle was approved on 2026-10-11. This pack prepares acceptance from [the product contract](../SPEC.md) and [the approved Popover design](../SPEC-POPOVER.md), independently of archived implementation code or historical tests. It contains no replacement library, Angular shim, dependency installation, build setup or delivery authorization.

loozo explicitly skipped the formal Baseline audit and chose “Freeze and prepare the seed” on 2026-10-11. No Baseline qualification claim is made; the required runtime matrix is unchanged. Genuine dependency setup and one implementation-free seed commit are authorized only in `/home/loozo/Projects/origami-ui-rebuild`, branch `rebuild`; product implementation remains unauthorized.

## Contents

| File                          | Purpose                                                                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core-consumer.ts`            | Direct Collection, Presence, Collapsible and both Accordion modes; public observation, keyed moves, retained children, frozen caller array and output counters                         |
| `composition-consumer.ts`     | Consumer `hostDirectives`, factory-backed writable Options, upper-only Accordion Trigger substitution, public Presence State, captured nearest injection and opaque identity           |
| `popover-consumer.ts`         | Content Options factory with all four fields; authored transformed/clipped ancestors; native callbacks, autofocus reentry, live bindings, placement changes and nested branch behavior |
| `hydration-unit.ts`           | Repeated identity key, generated Accordion values, initially-present/absent retained nodes, Collapsible replay and initially-open/closed Popover                                       |
| `hydration-consumer.ts`       | Genuine interaction-triggered `@defer` boundaries; reverse sibling hydration; supported incremental/eager provider configurations                                                      |
| `eager-hydration-consumer.ts` | The same units without deferred boundaries, in a separate file                                                                                                                         |
| `types.ts`                    | Compile-only positive provider/signature checks and negative readonly/mode/Content-migration checks                                                                                    |
| `CASES.md`                    | Explicit inputs, actions and observable expected outcomes for the complete contract                                                                                                    |

These seeds are deliberately small, not a finished evaluator. The case definitions identify additional variants still needed: all Options tokens with both provider kinds, animation modes, cardinality/remount, writing modes/fallback geometry, trusted gesture variants, nested root/part boundaries and synchronous factory-Options reentry. Seed presence is not executed case coverage. Do not report those variants as implemented simply because they are specified.

No source-path imports of the library, private Context calls, guessed IDs, fake native events presented as trusted input, or fake platform/dependency behavior belong in acceptance.

## Future use

1. Preserve the frozen agreed contract and these public sources, not the archived repository/history. Formal Baseline auditing is skipped, not reported passed.
2. Under the isolated seed-setup authority, create the smallest ordinary official Angular application and install genuine dependencies. No product behavior is authorized. After the later authorized rebuild produces the library, install/consume that genuine built package. Use package imports; do not alias missing imports to declarations or archived source to make compilation pass.
3. Strictly typecheck `types.ts` against built declarations, including unused `@ts-expect-error` diagnostics. Build the consumer templates with genuine Angular AOT/strict templates. Do not import the compile-only negative checks into a runtime app.
4. Mount `CoreConsumer`, `CompositionConsumer` and `PopoverConsumer` as separate ordinary fixture routes/pages. No new router framework is required.
5. Bootstrap `EagerHydrationConsumer` with `eagerHydrationConfig`, or `IncrementalHydrationConsumer` with `incrementalHydrationConfig`. Use the selected hydration configuration in both client and server bootstraps and the normal official SSR setup. The eager component is separate so its references cannot defeat the incremental file's lazy dependency analysis. Run the development deferred proof with HMR disabled (`--no-hmr`): Angular otherwise eagerly fetches deferred chunks. Keep eager route imports from pulling the held dependency into initial code; verify real chunk loading and each block's attachment separately.
6. Add only the case-specific consumer variants and a thin black-box runner needed by `CASES.md`. Keep assertion ownership independent of product internals; tests can evolve with review, not quietly redefine the frozen product.

Current sources target the researched official Angular **22.1.5**, whose source tag resolves to `468b65b74566537456c192ac4281795c5a1e1a5e`. Its hydration and directive-composition guides/declarations establish:

- `provideClientHydration()` enables incremental hydration and its event replay by default.
- Eager control uses `withNoIncrementalHydration()`; `withEventReplay()` explicitly retains replay for that control.
- `hydrate on interaction` uses click/keydown. Nested boundaries hydrate ancestors before the triggered descendant, not arbitrary child-before-parent order.
- A standalone deferred dependency must not be referenced outside its deferred template in the same source file; keep the eager fixture separate and verify actual chunk/dehydration behavior.
- Upper host-directive providers take precedence, and host directives construct before their consumers. The library must defer Options resolution rather than rely on construction ordering accidentally succeeding.

This is researched fixture compatibility, not product qualification. The isolated seed setup must pin and verify its genuine dependency closure.

## Observation rules

- Identify cases by fixture `data-testid` and unit label; qualify actual library IDs separately. Compare generated IDs/values for equality, uniqueness and stability, never against a spelling or counter sequence.
- Before bootstrap, capture raw genuine SSR HTML, actual host/child node references, parents, IDs, ARIA associations, generated values and owned Presence markers. A browser driver may briefly hold the ordinary bootstrap module response to save references; it must not replace HTML, annotations or Angular hydration behavior. A `DOMContentLoaded` callback alone may already be too late.
- Record transient removal/duplication with a passive observer as well as final identity. Do not move nodes or manually force hydration/Presence markers.
- For early event replay, establish that Angular's genuine capture mechanism is already installed before the initiating action. For deferred replay, hold the real deferred dependency response if needed, send a trusted click, then release it. Do not manufacture replay events or assume every pointer event is replayed.
- `data-client-render-seen` is a fixture diagnostic: its owner ran a browser render callback. It is **not a hydration-complete barrier**. Prove node reuse, genuine deferred boundaries, replay, interaction and error-free hydration separately.
- Actions on controls outside an open Popover can legitimately dismiss it. Use the controls inside Content for placement/live-binding changes and inside script-close/suppression cases. Keep outside-pointer and script-focus policies distinct.
- Observe root intent, Content retention, Trigger participation and native `:popover-open` separately. A visible retained exit is natively open but nonparticipating/inert. Native hiding is the point of no return; a callback reopening then needs a fresh post-hide activation.
- Derive simple preferred-placement expectations directly from settled DOM rectangles and logical edges, not another `computePosition()` call. Record the actual fallback candidate/overflow situation. Account for declared consumer transforms during animation; settled preferred-placement checks use a stated CSS-pixel tolerance.
- Native event listeners may observe/cancel opening or change desired intent. They must not independently call show/hide or modify the host's Popover mode. Fixtures never use the later `.popover` property or `{ source }`.
- To qualify synchronous `beforetoggle`/focus reentry, use a factory-backed root variant that writes the actual effective writable `open` and observe public State before the callback returns. The seed's parent-bound signal alone does not prove during-call propagation. Correlate focus events with fresh native activation versus retained-exit reuse; a focus counter alone is not an autofocus-activation count.

## Required qualification, not executed evidence

Record exact Angular/dependency closure and browser-engine versions. Mandatory runtime qualification covers **Chromium, Firefox and WebKit × development and production × eager and incremental hydration**, with normal/reduced-motion cases where relevant. Pure compile/declaration checks run separately; progressive `until-found` behavior is capability-dependent, while ordinary hidden behavior is mandatory everywhere.

Use real production responses and runtime, not a development server with optimization flags. Archive failing and passing observations against exact source/test identities. Playwright WebKit is not universal Safari/iOS or physical-device certification.

The current preparation may receive formatter/linter, TypeScript syntax and genuine Angular template-parser checks. Those do **not** typecheck package imports, run Angular AOT, validate SSR, execute browser cases or prove the rewrite. Ordinary build/SSR seed setup is now separately authorized. Product implementation, missing executable variants/runner, the fresh-session rebuild authority and runtime evidence remain later work.
