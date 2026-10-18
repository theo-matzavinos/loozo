# Origami UI — independent acceptance preparation

**Status: handwritten public consumer seeds and explicit case definitions for the current product contract, executed by [`tests/acceptance`](../tests/acceptance/README.md) on Angular 22.2.2; `@loozo/origami-ui` 0.0.1 passed the full gate. The 22.1.5 statements below are the dated research from when this pack was prepared on 2026-10-11; see [PROVENANCE.md](../PROVENANCE.md).**

The Popover design/API/lifecycle was approved on 2026-10-11. This pack defines acceptance from [the product contract](../SPEC.md) and [the approved Popover design](../SPEC-POPOVER.md), independently of archived implementation code or historical tests. It contains no replacement library, Angular shim, dependency installation or build setup.

loozo explicitly skipped the formal Baseline audit on 2026-10-11. No Baseline qualification claim is made; the required runtime matrix is unchanged.

## Contents

| File                          | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core-consumer.ts`            | Direct Collection, Presence, Collapsible, both Accordion modes, Toggle, Tabs, both ToggleGroup modes, Toolbar and RadioGroup; public observation, keyed moves, retained children, frozen caller array and output counters                                                                                                                                                                                                       |
| `composition-consumer.ts`     | Consumer `hostDirectives`, factory-backed writable Options, upper-only Accordion Trigger substitution, existing/factory Toggle, Tabs, ToggleGroup, Toolbar and RadioGroup Options, a Toolbar Toggle, public Presence, Toggle, Tabs, ToggleGroup, Toolbar and RadioGroup State, nested RadioGroups, captured nearest injection and opaque identity                                                                               |
| `popover-consumer.ts`         | Content Options factory with all four fields; authored transformed/clipped ancestors; native callbacks, autofocus reentry, live bindings, placement changes and nested branch behavior                                                                                                                                                                                                                                          |
| `hydration-unit.ts`           | Repeated identity key, generated Accordion values, initially-present/absent retained nodes, Collapsible and Toggle replay, initially-pressed/unpressed Toggle, selected/unselected Tabs with a DOM-order tab stop, pressed/unpressed Single and Multiple ToggleGroups, Toolbars with a DOM-order tab stop across Toolbar groups, checked/unchecked, disabled-checked and Toolbar RadioGroups, and initially-open/closed Popover |
| `hydration-consumer.ts`       | Genuine interaction-triggered `@defer` boundaries; reverse sibling hydration; supported incremental/eager provider configurations                                                                                                                                                                                                                                                                                               |
| `eager-hydration-consumer.ts` | The same units without deferred boundaries, in a separate file                                                                                                                                                                                                                                                                                                                                                                  |
| `types.ts`                    | Compile-only positive provider/signature checks and negative readonly/mode/Content-migration checks                                                                                                                                                                                                                                                                                                                             |
| `CASES.md`                    | Explicit inputs, actions and observable expected outcomes for the complete contract                                                                                                                                                                                                                                                                                                                                             |

These seeds are deliberately small. The case definitions call for further variants: all Options tokens with both provider kinds, animation modes, cardinality/remount, writing modes/fallback geometry, trusted gesture variants, nested root/part boundaries and synchronous factory-Options reentry. [`tests/acceptance`](../tests/acceptance/README.md) adds them. A seed alone is not executed case coverage, and a specified variant counts as covered only once the gate executes it.

No source-path imports of the library, private Context calls, guessed IDs, fake native events presented as trusted input, or fake platform/dependency behavior belong in acceptance.

## Using the pack

1. Work from the product contract and these public sources, not the archived repository/history. Formal Baseline auditing is skipped, not reported passed.
2. Consume the genuine built package from the smallest ordinary official Angular application with genuine dependencies ([`tests/acceptance`](../tests/acceptance/README.md) stages it into `.scratch/consumer`). Use package imports; do not alias missing imports to declarations or archived source to make compilation pass.
3. Strictly typecheck `types.ts` against built declarations, including unused `@ts-expect-error` diagnostics. Build the consumer templates with genuine Angular AOT/strict templates. Do not import the compile-only negative checks into a runtime app.
4. Mount `CoreConsumer`, `CompositionConsumer` and `PopoverConsumer` as separate ordinary fixture routes/pages. No new router framework is required.
5. Bootstrap `EagerHydrationConsumer` with `eagerHydrationConfig`, or `IncrementalHydrationConsumer` with `incrementalHydrationConfig`. Use the selected hydration configuration in both client and server bootstraps and the normal official SSR setup. The eager component is separate so its references cannot defeat the incremental file's lazy dependency analysis. Run the development deferred proof with HMR disabled (`--no-hmr`): Angular otherwise eagerly fetches deferred chunks. Keep eager route imports from pulling the held dependency into initial code; verify real chunk loading and each block's attachment separately.
6. Case-specific consumer variants and the black-box runner live in [`tests/acceptance`](../tests/acceptance/README.md); add only what `CASES.md` needs. Keep assertion ownership independent of product internals; tests can evolve with review, not quietly redefine the product contract.

Current sources target the researched official Angular **22.1.5**, whose source tag resolves to `468b65b74566537456c192ac4281795c5a1e1a5e`. Its hydration and directive-composition guides/declarations establish:

- `provideClientHydration()` enables incremental hydration and its event replay by default.
- Eager control uses `withNoIncrementalHydration()`; `withEventReplay()` explicitly retains replay for that control.
- `hydrate on interaction` uses click/keydown. Nested boundaries hydrate ancestors before the triggered descendant, not arbitrary child-before-parent order.
- A standalone deferred dependency must not be referenced outside its deferred template in the same source file; keep the eager fixture separate and verify actual chunk/dehydration behavior.
- Upper host-directive providers take precedence, and host directives construct before their consumers. The library must defer Options resolution rather than rely on construction ordering accidentally succeeding.

This is researched fixture compatibility, not product qualification. The gate qualifies the installed dependency closure.

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

## Required qualification

Record exact Angular/dependency closure and browser-engine versions. Mandatory runtime qualification covers **Chromium, Firefox and WebKit × development and production × eager and incremental hydration**, with normal/reduced-motion cases where relevant. Pure compile/declaration checks run separately; progressive `until-found` behavior is capability-dependent, while ordinary hidden behavior is mandatory everywhere.

Use real production responses and runtime, not a development server with optimization flags. Archive failing and passing observations against exact source/test identities. Playwright WebKit is not universal Safari/iOS or physical-device certification.

Formatter/linter, TypeScript syntax and Angular template-parser checks on this pack do **not** typecheck package imports, run Angular AOT, validate SSR or execute browser cases. The gate in [`tests/acceptance`](../tests/acceptance/README.md) does those.
