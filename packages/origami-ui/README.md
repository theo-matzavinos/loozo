# @loozo/origami-ui

Headless, accessible Angular primitives: Collection, Presence, Collapsible, single and multiple Accordion, and Popover. They own behavior, state, IDs, ARIA associations, hydration and native top-layer presentation. You own the markup, styling and composition.

Every primitive is a directive. Each configurable part reads typed **Options** that you can replace, exposes a readonly **State** you can inject, and composes into your own directives through `hostDirectives`.

```ts
import { Component } from "@angular/core";
import {
  OrigamiCollapsible,
  OrigamiCollapsiblePanel,
  OrigamiCollapsibleTrigger,
} from "@loozo/origami-ui/collapsible";

@Component({
  selector: "app-details",
  imports: [OrigamiCollapsible, OrigamiCollapsibleTrigger, OrigamiCollapsiblePanel],
  template: `
    <div ogCollapsible [(expanded)]="expanded">
      <button ogCollapsibleTrigger>Details</button>
      <div ogCollapsiblePanel>Consumer-owned panel content</div>
    </div>
  `,
})
export class Details {
  expanded = false;
}
```

**Status:** experimental and not yet published. Version `0.0.1`, MIT license. The package is `private` until its first release is explicitly prepared.

## Requirements

- Angular `22.2.2` exactly: `@angular/core` and `@angular/common` are exact peer dependencies. This is the version the package is qualified on; a broader supported range comes with the first release.
- Server-side rendering and both eager and incremental hydration are supported and qualified; see [SPEC.md](SPEC.md) section 12.
- Popover positioning uses `@floating-ui/dom` `1.8.0`, a regular dependency.

## Entry points

The root entry point `@loozo/origami-ui` is intentionally empty. Import from the secondary entry points:

| Entry point                     | Exports                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@loozo/origami-ui/utils`       | `injectDeferred`, `injectUniqueId`                                                                                                                                                                                                                                                                                             |
| `@loozo/origami-ui/collection`  | `OrigamiCollection`, `OrigamiCollectionState`, `OrigamiCollectionItem`, `OrigamiCollectionItemOptions`, type `OrigamiCollectionRecord`                                                                                                                                                                                         |
| `@loozo/origami-ui/presence`    | `OrigamiPresence`, `OrigamiPresenceOptions`, `OrigamiPresenceState`, type `OrigamiPresencePhase`                                                                                                                                                                                                                               |
| `@loozo/origami-ui/collapsible` | `OrigamiCollapsible`, `OrigamiCollapsibleOptions`, `OrigamiCollapsibleState`, `OrigamiCollapsibleTrigger`, `OrigamiCollapsibleTriggerOptions`, `OrigamiCollapsiblePanel`, `OrigamiCollapsiblePanelOptions`, type `OrigamiCollapsibleHiding`                                                                                    |
| `@loozo/origami-ui/accordion`   | `OrigamiAccordionSingle`, `OrigamiAccordionSingleOptions`, `OrigamiAccordionMultiple`, `OrigamiAccordionMultipleOptions`, `OrigamiAccordionOptions`, `OrigamiAccordionState`, `OrigamiAccordionItem`, `OrigamiAccordionTrigger`, `OrigamiAccordionTriggerOptions`, `OrigamiAccordionPanel`, `OrigamiAccordionPanelOptions`     |
| `@loozo/origami-ui/popover`     | `OrigamiPopover`, `OrigamiPopoverOptions`, `OrigamiPopoverState`, `OrigamiPopoverTrigger`, `OrigamiPopoverTriggerOptions`, `OrigamiPopoverAnchor`, `OrigamiPopoverAnchorOptions`, `OrigamiPopoverContent`, `OrigamiPopoverContentOptions`, `OrigamiPopoverContentState`, type `OrigamiPopoverSide`, type `OrigamiPopoverAlign` |

Every export carries TSDoc covering defaults, ownership, composition, lifecycle, errors and hydration.

## Composing your own directives

Wrap a part with `hostDirectives` and replace its Options with your own inputs. The replacement must supply the complete Options shape:

```ts
import { Directive, inject, input } from "@angular/core";
import {
  OrigamiPopoverContent,
  OrigamiPopoverContentOptions,
  OrigamiPopoverContentState,
  type OrigamiPopoverAlign,
  type OrigamiPopoverSide,
} from "@loozo/origami-ui/popover";
import { injectUniqueId } from "@loozo/origami-ui/utils";

@Directive({
  selector: "[appMenuContent]",
  hostDirectives: [OrigamiPopoverContent],
  providers: [OrigamiPopoverContentOptions.provideFactory(() => inject(MenuContent))],
})
export class MenuContent implements OrigamiPopoverContentOptions {
  readonly id = input(injectUniqueId("menu-content"));
  readonly side = input<OrigamiPopoverSide>("block-end");
  readonly align = input<OrigamiPopoverAlign>("start");
  readonly gap = input(4);
  readonly state = inject(OrigamiPopoverContentState);
}
```

Further handwritten consumers, including Accordion, Presence, Collection and hydration setups, are in [acceptance/](acceptance/).

## Limitations

- No styled components, themes or design tokens; no menu, listbox or select semantics; no focus traps or roving tabindex.
- `injectUniqueId` IDs match between server and client only for element-host calls.
- Browser qualification covers Playwright's Chromium, Firefox and WebKit builds, not Safari, iOS or physical devices. No formal Baseline claim is made.
- Open evidence limits (native find-in-page, mismatched pointer gestures, out-of-order geometry) are listed in [tests/acceptance/README.md](tests/acceptance/README.md#known-evidence-limits).

## Further reading

- [SPEC.md](SPEC.md): the frozen product contract.
- [SPEC-POPOVER.md](SPEC-POPOVER.md): the approved Popover design.
- [acceptance/](acceptance/README.md): case definitions (`CASES.md`), public type checks and handwritten consumers.
- [tests/acceptance/README.md](tests/acceptance/README.md): how the acceptance suite works.
- [PROVENANCE.md](PROVENANCE.md): where this package came from.

## Developing this package

The library builds with ng-packagr into `dist/`, a complete Angular Package Format package. Acceptance always tests that real build: it is packed with `npm pack` and installed with a strict npm installation into a scratch copy of the consumer application, `packages/origami-ui/.scratch/consumer` (ignored). The consumer's authored sources live in [`examples/origami-ui`](../../examples/origami-ui).

| Command                        | What it does                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run build`               | ng-packagr build into `dist/`, finished by `scripts/finish-package.mjs`                                                                               |
| `pnpm run check`               | `vp check` (format and lint)                                                                                                                          |
| `pnpm run typecheck`           | Library sources and the acceptance runner; no build or install                                                                                        |
| `pnpm run acceptance:prepare`  | Build, then install the scratch consumer from clean. Required once, and whenever the example's `package.json` or the library's dependencies change    |
| `pnpm test`                    | Browser-free checks against the packed build: consumer typecheck, public type checks and Node/SSR checks. Part of the root `pnpm test`                |
| `pnpm run test:fast`           | `test`, then Chromium readiness, observer calibration and every product case in one Chromium development project. About three minutes                 |
| `pnpm run test:focus <filter>` | Sync, then the same Chromium project filtered by spec file or `-g` title                                                                              |
| `pnpm run test:full`           | The release gate: 24 projects across three engines, development/production and eager/incremental hydration, plus every static check. About 50 minutes |
| `pnpm run example:build`       | Build the example in the workspace, against `packages/origami-ui/dist`. Convenience only; not qualification                                           |

From the repository root, run any of these with `pnpm --filter @loozo/origami-ui run <script>`. The root `pnpm test` runs this package's browser-free `test`, so it needs `acceptance:prepare` first; a missing or outdated installation fails with that instruction. Neither `test:fast` nor `test:full` runs from the root.

On small hosts, set `NG_BUILD_MAX_WORKERS=2`. WebKit may need private libraries; see [tests/acceptance/README.md](tests/acceptance/README.md#private-webkit-libraries).
