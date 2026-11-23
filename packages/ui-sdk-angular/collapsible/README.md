# Collapsible

`@loozo/ui-sdk-angular/collapsible`: a panel its trigger shows and hides, core's `collapsible`, from directives on elements you write: the collapsible, its trigger and its panel. The panel is structural: core decides whether its element is in the page.

```ts
import {
  UiCollapsible,
  UiCollapsiblePanel,
  UiCollapsibleTrigger,
} from "@loozo/ui-sdk-angular/collapsible";
```

```html
<div uiCollapsible [(open)]="details" (openChangeComplete)="settled($event)">
  <button uiCollapsibleTrigger>Details</button>
  <div *uiCollapsiblePanel class="details">…</div>
</div>
```

## `uiCollapsible`

`exportAs: "uiCollapsible"`. Put it on an element around the trigger and the panel.

| Input         | Type                                 | Core option                                                                     |
| ------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `open`        | `boolean \| undefined`               | Whether it's open. Set it to control the collapsible.                           |
| `defaultOpen` | `boolean \| undefined`               | Whether it starts open, when uncontrolled.                                      |
| `disabled`    | `boolean \| undefined`               | Stops trigger presses. `[open]`, the controller and find in page still open it. |
| `controller`  | `CollapsibleController \| undefined` | From core's `createCollapsibleController()`, to open or close it from anywhere. |
| `debug`       | `boolean \| undefined`               | Logs state changes, in development builds.                                      |

| Output               | Payload                                                       |
| -------------------- | ------------------------------------------------------------- |
| `openChangeRequest`  | `{ value: boolean, details }`; `details.cancel()` refuses it. |
| `openChange`         | `boolean`, unless a request listener canceled it.             |
| `openChangeComplete` | `boolean`, once the panel finished opening or closing.        |

`state: Signal<CollapsibleState>` is `{ open, disabled }`.

**Proposed, then committed.** `openChange` is the proposal, emitted before core commits it: with `[(open)]` it lands when the binding writes it back; uncontrolled, core stores it after your listeners return, so `state()` read inside an `(openChange)` listener still has the old value. `state()` and the attributes are the committed state; `openChangeComplete` is the panel settling after its animations, and never fires on the first render. A parent writing `[open]` directly commits with no request, and the panel's settle still emits `openChangeComplete`.

## Parts

| Directive              | `exportAs`             | Inputs                            | `state()`            |
| ---------------------- | ---------------------- | --------------------------------- | -------------------- |
| `uiCollapsibleTrigger` | `uiCollapsibleTrigger` | none                              | `{ open, disabled }` |
| `uiCollapsiblePanel`   | `uiCollapsiblePanel`   | `keepMounted`, `hiddenUntilFound` | `{ open, disabled }` |

- **The trigger** goes on a `<button>`: another element gets `role="button"` and its tab stop only once it binds.
- **The panel is structural.** Write `*uiCollapsiblePanel` on the panel's element. It's in the page while core has it there: open, closing (until its exit animation ends), kept (`keepMounted`) or findable (`hiddenUntilFound`). A closed panel in the default mode isn't in the page, and its content, with any component state inside it, is destroyed; a kept or findable one keeps its content while hidden.
- **Per-panel options need the `<ng-template>` form**: in `*uiCollapsiblePanel="…; keepMounted: true"`, Angular would bind an input named `uiCollapsiblePanelKeepMounted`, so write

  ```html
  <ng-template uiCollapsiblePanel hiddenUntilFound>
    <div class="details">…</div>
  </ng-template>
  ```

  `keepMounted` keeps the closed panel in the page with `hidden`; `hiddenUntilFound` keeps it as `hidden="until-found"`, so the browser's find in page can open it.

- **One unconditional root element.** The panel's template renders exactly one element, the panel: put everything else, every `@if` and `@for` included, inside it. Two elements, text or no element throws `UiSdkError` when the panel first renders, in every build. The check runs when the panel's view is created, so it catches static siblings only: a top-level `@if` or `@for` beside the element renders outside the panel without an error.
- **Read its state through `exportAs`** on the `<ng-template>` form, `<ng-template uiCollapsiblePanel #panel="uiCollapsiblePanel">`, or from the root.
- **It can't be composed through `hostDirectives`**: it needs its template. Put it straight on the element.

## Rules

- **Style by core's attributes**: `[data-open]`, `[data-closed]`, `[data-disabled]`, `[aria-expanded="true"]` on the trigger, and `[data-starting-style]`/`[data-ending-style]` for enter and exit transitions. Core sizes the open panel with `--collapsible-panel-height` and `--collapsible-panel-width` once it binds.
- **Don't set `display` on a kept or findable panel's class.** Core's rule that hides `[hidden]` panels arrives when the panel binds, so author `display` wins until then and shows the closed panel; scope it with `:not([hidden])`.
- **Don't read a part's `state()` from a binding on its own element**: that throws `UiSdkError`. Read it from a descendant or another element.
- **`disabled` stops trigger presses only** (core's contract): `[open]`, the controller and find in page still open a disabled collapsible.

## Server rendering

What the server renders for a closed collapsible, by panel mode:

```html
<!-- default: no panel element; the trigger has no aria-controls -->
<div uicollapsible data-ui-sdk-id="ui-sdk-s0" data-slot="collapsible" data-closed>
  <button
    data-slot="collapsible-trigger"
    id="ui-sdk-s0-trigger"
    type="button"
    aria-expanded="false"
    data-closed
  >
    Details
  </button>
  <!--container-->
</div>
<!-- keepMounted -->
<div data-slot="collapsible-panel" id="ui-sdk-s0-panel" hidden="" data-closed>…</div>
<!-- hiddenUntilFound -->
<div data-slot="collapsible-panel" id="ui-sdk-s0-panel" hidden="until-found" data-closed>…</div>
```

An open one renders its panel and the trigger's `aria-controls`.

- **At bind**, core adds what the server can't know: a kept or findable closed panel's trigger gets `aria-controls`, and the panel its size variables.
- **A panel that opens in the browser** has its attributes and `data-starting-style` by its first frame. Code that runs synchronously between its insertion and the first write, like a directive constructor inside the panel, sees the element without core's attributes.
- **Find in page before hydration** reveals a findable panel's text without opening the collapsible: core isn't listening yet. The hidden state comes back when the panel hydrates or binds. After bind, a find opens it with `openChangeRequest`'s reason `"find-in-page"`, and canceling restores `until-found`.
- **A malformed panel template in a panel closed on the server** throws only when the panel first opens, since its view is created then.
