# @loozo/origami-ui

Headless, accessible Angular primitives: Collection, Presence, Collapsible, single and multiple Accordion, Popover, Toggle, Tabs, single and multiple ToggleGroup, Toolbar and RadioGroup. They own behavior, state, generated IDs, ARIA associations and Popover's native top-layer presentation, and they're safe to render on the server and hydrate. You own the markup, roles and accessible names, styling, dimensions and animation.

Every primitive is a directive you put on your own elements, or compose into your own directives through `hostDirectives`. Each configurable part reads typed **Options** that you can replace. The roots, Presence, Popover Content, Toggle, and the Accordion Items, ToggleGroup items and Collapsible and Accordion Panels that compose them also expose a readonly **State** that you can inject or read through a template reference.

Use it when you're building your own design system or application components in Angular 22 and want tested behavior for disclosure, selection, enter/exit animation, anchored popovers, toggle buttons, tabs, toggle groups, toolbars and radio groups, without adopting someone else's markup or styles. It renders on the server and hydrates, both eagerly and incrementally, without client-only fallbacks.

**Status:** experimental and published on npm. MIT license.

## Install

```sh
npm install @loozo/origami-ui
```

Peer dependencies:

| Package           | Range     |
| ----------------- | --------- |
| `@angular/core`   | `~22.2.2` |
| `@angular/common` | `~22.2.2` |

The package is tested against Angular 22.2.2. It supports Angular 22.2.x from 22.2.2, not earlier patches: it's built with the 22.2.2 compiler, and an application's Angular compiler must be at least as new as the one a library was built with. Popover positioning uses `@floating-ui/dom` `1.8.0`, a regular dependency. Its types and middleware aren't part of the API.

The root entry point `@loozo/origami-ui` is intentionally empty. Import from the secondary entry points, each documented in its own README:

| Entry point                                                | Exports                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@loozo/origami-ui/collection`](collection/README.md)     | `OrigamiCollection`, `OrigamiCollectionState`, `OrigamiCollectionItem`, `OrigamiCollectionItemOptions`, type `OrigamiCollectionRecord`                                                                                                                                                                                                                    |
| [`@loozo/origami-ui/presence`](presence/README.md)         | `OrigamiPresence`, `OrigamiPresenceOptions`, `OrigamiPresenceState`, type `OrigamiPresencePhase`                                                                                                                                                                                                                                                          |
| [`@loozo/origami-ui/collapsible`](collapsible/README.md)   | `OrigamiCollapsible`, `OrigamiCollapsibleOptions`, `OrigamiCollapsibleState`, `OrigamiCollapsibleTrigger`, `OrigamiCollapsibleTriggerOptions`, `OrigamiCollapsiblePanel`, `OrigamiCollapsiblePanelOptions`, type `OrigamiCollapsibleHiding`                                                                                                               |
| [`@loozo/origami-ui/accordion`](accordion/README.md)       | `OrigamiAccordionSingle`, `OrigamiAccordionSingleOptions`, `OrigamiAccordionMultiple`, `OrigamiAccordionMultipleOptions`, `OrigamiAccordionOptions`, `OrigamiAccordionState`, `OrigamiAccordionItem`, `OrigamiAccordionItemOptions`, `OrigamiAccordionTrigger`, `OrigamiAccordionTriggerOptions`, `OrigamiAccordionPanel`, `OrigamiAccordionPanelOptions` |
| [`@loozo/origami-ui/popover`](popover/README.md)           | `OrigamiPopover`, `OrigamiPopoverOptions`, `OrigamiPopoverState`, `OrigamiPopoverTrigger`, `OrigamiPopoverTriggerOptions`, `OrigamiPopoverAnchor`, `OrigamiPopoverAnchorOptions`, `OrigamiPopoverContent`, `OrigamiPopoverContentOptions`, `OrigamiPopoverContentState`, type `OrigamiPopoverSide`, type `OrigamiPopoverAlign`                            |
| [`@loozo/origami-ui/toggle`](toggle/README.md)             | `OrigamiToggle`, `OrigamiToggleOptions`, `OrigamiToggleState`                                                                                                                                                                                                                                                                                             |
| [`@loozo/origami-ui/tabs`](tabs/README.md)                 | `OrigamiTabs`, `OrigamiTabsOptions`, `OrigamiTabsState`, `OrigamiTabsList`, `OrigamiTabsTrigger`, `OrigamiTabsTriggerOptions`, `OrigamiTabsPanel`, `OrigamiTabsPanelOptions`, type `OrigamiTabsOrientation`, type `OrigamiTabsActivation`                                                                                                                 |
| [`@loozo/origami-ui/toggle-group`](toggle-group/README.md) | `OrigamiToggleGroupSingle`, `OrigamiToggleGroupSingleOptions`, `OrigamiToggleGroupMultiple`, `OrigamiToggleGroupMultipleOptions`, `OrigamiToggleGroupState`, `OrigamiToggleGroupItem`, `OrigamiToggleGroupItemOptions`, type `OrigamiToggleGroupOrientation`                                                                                              |
| [`@loozo/origami-ui/toolbar`](toolbar/README.md)           | `OrigamiToolbar`, `OrigamiToolbarOptions`, `OrigamiToolbarState`, `OrigamiToolbarItem`, `OrigamiToolbarItemOptions`, `OrigamiToolbarToggleGroupSingle`, `OrigamiToolbarToggleGroupMultiple`, `OrigamiToolbarRadioGroup`, type `OrigamiToolbarOrientation`                                                                                                 |
| [`@loozo/origami-ui/radio-group`](radio-group/README.md)   | `OrigamiRadioGroup`, `OrigamiRadioGroupOptions`, `OrigamiRadioGroupState`, `OrigamiRadioGroupItem`, `OrigamiRadioGroupItemOptions`                                                                                                                                                                                                                        |
| [`@loozo/origami-ui/utils`](utils/README.md)               | `injectDeferred`, `injectUniqueId`, `injectUniqueValue`                                                                                                                                                                                                                                                                                                   |

The Accordion entry point also exports `ɵOrigamiAccordionRoot`, and the ToggleGroup and RadioGroup entry points `ɵOrigamiToggleGroupRoot` and `ɵOrigamiRadioGroupRoot`, which compiled composition needs. The Collection entry point exports `ɵOrigamiRovingFocusContext` and `ɵOrigamiRovingFocusOptions`, the package-private keyboard focus behind Tabs, ToggleGroup, Toolbar and RadioGroup, and `ɵrequestSingleSelection` and `ɵrequestMultipleSelection`, the package-private selection writes behind Accordion, ToggleGroup and RadioGroup. None of them is an application API. Every export carries TSDoc with its defaults, ownership, errors and hydration behavior; your editor shows it from the published declarations.

## How the primitives fit together

```text
Your directive or component
    │ hostDirectives, and optionally a replacement for the part's Options
    ▼
Primitive directive          inputs, models and their defaults; host bindings
    │
    ▼
Options token ──► private Context ──► readonly State
                  behavior,           injectable by you and by descendants
                  registration,
                  lifecycle
```

- **Options** are the effective configuration of one part: an abstract class of signals. By default the directive itself provides them, from its own inputs and models. Every Options class has two helpers that replace them, each returning a `Provider` for the `providers` of your directive or component that composes the primitive through `hostDirectives`:
  - `provideExisting(() => Type)` uses another class on the same element, usually your own directive, which must implement the Options. Forward references work.
  - `provideFactory(() => options)` uses an object you build. The factory runs in an injection context, so it can call `inject()`.

  A replacement replaces the configuration as a whole: it must supply every property, and the directive's own inputs and defaults are ignored. Writable properties can be ordinary `signal()`s; writing them doesn't emit the unused directive's model output.

- **Context** is private and owns the behavior. Parts register with the nearest owner in Angular's DI, so nested roots are independent and descendants share their own root's State. A part's registration becomes visible to other parts once Angular has set its inputs, so replacement Options can use required inputs, and a part never sees another part's default values in place of bound ones, wherever the two are rendered.
- **State** is a readonly facade over the nearest owner, provided on that owner's element: Collection, Presence, Collapsible, each Accordion mode, the Popover root, Popover Content, Toggle, the Tabs root, each ToggleGroup mode, the Toolbar and the RadioGroup root. Inject it in a descendant or a composing directive. Those directives also expose it as their `state` property, which you can read through a template reference. A directive that composes one of them exposes the composed State as its own `state`: `ogAccordionItem` the Collapsible's, `ogToggleGroupItem` the Toggle's, and `ogCollapsiblePanel` and `ogAccordionPanel` Presence's. Triggers, Anchors, Toolbar items, Tabs parts, RadioGroup items and Collection items have no `state` property. It has no writable aliases.

Upper primitives are built from lower ones: Accordion composes Collection and Collapsible, ToggleGroup's items compose Toggle, and Collapsible's Panel and Popover's Content compose Presence. Replacing an upper part's Options also drives the lower part, so you don't need to replace lower Options yourself.

A primitive that needs an owner, such as an item without a Collection, fails with Angular's missing-provider error. A second mounted Trigger, Panel, Anchor or Content in one Collapsible or Popover fails with an error naming the role; Angular reports it through the application's `ErrorHandler`.

## Server rendering and hydration

Every primitive renders on the server and hydrates with Angular's `provideClientHydration`, with or without incremental hydration. There's no extra provider, `ngSkipHydration` or client-only rendering.

- Hydration reuses the server's elements: hosts and their children keep their identity, and initially-present content isn't removed and recreated. An element that was present on the server doesn't replay its entrance animation when it hydrates.
- Initially-absent Presence-gated content isn't in the server HTML and doesn't appear when its owner hydrates.
- Generated IDs match between server and client, including when `@defer` blocks hydrate in a different order from the server, and IDs the browser generates for content it creates never collide with server-rendered ones. Generated item values are application-local and aren't guaranteed to match across hydration; give items explicit values when they must survive hydration.
- An Angular event replayed after incremental hydration reaches the model once.

**The rendered-ID rule:** `injectUniqueId` matches server and client only for an ID rendered as its host element's `id`, as every primitive's `id` input does: while hydrating, the browser reads the rendered `id` back. An ID used anywhere else, or allocated in an application service or another injection context without an element host, is still unique in the application, but don't bind it into server-rendered DOM, because the client will generate a different one. Uniqueness across several Angular applications in one document isn't guaranteed; coordinate explicit IDs there.

Explicit and static `id` bindings always take precedence over generated ones.

## Limitations

- No styled components, themes or design tokens. No menu, listbox or select semantics or focus traps. Tabs, ToggleGroup, Toolbar and RadioGroup are the only primitives with roving tabindex and arrow-key navigation.
- Angular 22.2.x from 22.2.2 only; tested against 22.2.2.
- Browsers are tested in Playwright's Chromium, Firefox and WebKit builds, not Safari, iOS or physical devices. No formal Baseline or minimum-version claim is made.
- Open evidence limits (native find-in-page, mismatched pointer gestures, out-of-order geometry) are listed in [tests/acceptance/README.md](tests/acceptance/README.md#known-evidence-limits).

## Further reading

- [SPEC.md](SPEC.md): the product contract.
- [SPEC-POPOVER.md](SPEC-POPOVER.md): the Popover design.
- [acceptance/](acceptance/): case definitions (`CASES.md`), public type checks and handwritten consumers.
- [`examples/origami-ui`](../../examples/origami-ui/): the consumer application the acceptance suite runs.
- [PROVENANCE.md](PROVENANCE.md): where this package came from.

## Developing this package

Requires Node 24.21.0 and pnpm 12.9.1. From this directory:

```sh
pnpm run build       # ng-packagr into dist/, finished by scripts/finish-package.mjs
pnpm run check       # formatting and lint
pnpm run typecheck   # library and acceptance runner sources
pnpm test            # browser-free checks against the packed build; also run by the root pnpm test
pnpm run test:fast   # test, then every product case in one Chromium project (about three minutes)
pnpm run test:focus popover   # sync, then the same Chromium project filtered by file or -g title
pnpm run test:full   # the release gate: 24 projects across three engines (about 50 minutes)
```

Acceptance tests the packed build installed into a scratch copy of the example application. On a fresh checkout, the first `test` (or `test:fast`, `test:focus`) runs the clean strict installation itself; after changing the example's `package.json` or the library's dependencies, run `pnpm run acceptance:prepare`. Set `NG_BUILD_MAX_WORKERS=2` on small hosts. WebKit may need private libraries.

The READMEs' code examples live in [`snippets/`](snippets/) and are typechecked by `pnpm run snippets:check`, which `test` and `test:full` run. See [tests/acceptance/README.md](tests/acceptance/README.md) for the suite, its prerequisites and every script.
