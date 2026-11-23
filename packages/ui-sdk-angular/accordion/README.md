# Accordion

`@loozo/ui-sdk-angular/accordion`: sections that open and close, core's `accordion`, from directives on elements you write: the accordion, its items, and each item's header, trigger and panel. The panel is structural: core decides whether its element is in the page.

```ts
import {
  UiAccordion,
  UiAccordionHeader,
  UiAccordionItem,
  UiAccordionPanel,
  UiAccordionTrigger,
} from "@loozo/ui-sdk-angular/accordion";
```

```html
<div uiAccordion [(value)]="open" multiple>
  @for (faq of faqs; track faq.id) {
  <div
    uiAccordionItem
    [value]="faq.id"
    (openChangeRequest)="guard($event)"
    (openChangeComplete)="log($event)"
  >
    <h3 uiAccordionHeader><button uiAccordionTrigger>{{ faq.question }}</button></h3>
    <div *uiAccordionPanel>{{ faq.answer }}</div>
  </div>
  }
</div>
```

## `uiAccordion`

`exportAs: "uiAccordion"`. Put it on an element around its items.

| Input              | Type                               | Core option                                                                        |
| ------------------ | ---------------------------------- | ---------------------------------------------------------------------------------- |
| `value`            | `T[] \| undefined`                 | The open items' values, also with `multiple` off. Set it to control the accordion. |
| `defaultValue`     | `T[] \| undefined`                 | The items open at first, when uncontrolled.                                        |
| `multiple`         | `boolean \| undefined`             | Lets several items be open at once.                                                |
| `collapsible`      | `boolean \| undefined`             | Whether the open item can close when only one may be open; core's default `true`.  |
| `disabled`         | `boolean \| undefined`             | Stops trigger presses on every item.                                               |
| `keepMounted`      | `boolean \| undefined`             | Keeps closed panels in the page, hidden.                                           |
| `hiddenUntilFound` | `boolean \| undefined`             | Keeps closed panels in the page as `hidden="until-found"`, for find in page.       |
| `controller`       | `AccordionController \| undefined` | From core's `createAccordionController()`, to open and close items from anywhere.  |
| `debug`            | `boolean \| undefined`             | Logs state changes, in development builds.                                         |

| Output               | Payload                                                   |
| -------------------- | --------------------------------------------------------- |
| `valueChangeRequest` | `{ value: T[], details }`; `details.cancel()` refuses it. |
| `valueChange`        | `T[]`, unless a request listener canceled it.             |

`state: Signal<AccordionState<T>>` is `{ value, disabled, multiple }`.

## `uiAccordionItem`

`exportAs: "uiAccordionItem"`. One section, around its header and panel.

| Input      | Type                   | Core prop                                                         |
| ---------- | ---------------------- | ----------------------------------------------------------------- |
| `value`    | `string \| undefined`  | Names it in the accordion's `value`. Unset, it gets a made value. |
| `disabled` | `boolean \| undefined` | Stops its trigger's presses.                                      |

| Output               | Payload                                                                        |
| -------------------- | ------------------------------------------------------------------------------ |
| `openChangeRequest`  | `{ value: boolean, details }`: something wants to open or close it. A request. |
| `openChangeComplete` | `boolean`, once its panel finished opening or closing.                         |

`state: Signal<AccordionItemState>` is `{ open, disabled, index }`.

- **A made value.** An item without `value` gets one made for it (`ui-sdk-s<n>` on the server), rendered as its `data-ui-sdk-id` so hydration keeps it; its trigger's and panel's ids derive from it. It appears in the accordion's `value` when the item opens.
- **Made values need a `string[]` model.** The accordion's `T` isn't checked against its items, so a made value reaches `valueChange` and `[(value)]` typed as `T`. With a narrower model, like `("shipping" | "billing")[]`, give every item an explicit `value` from that union.
- **An item has no `openChange`.** What an item reports is a request and its panel settling, never a commit, because the commit is the accordion's.

### Requests, then the commit

For a press, core calls every affected item's `onOpenChange` (the open ones closing first, then the one opening), then the accordion's `onValueChange`. Any `details.cancel()` along the way refuses the whole change. So:

1. each affected item emits `openChangeRequest`: "asked", never "committed";
2. the accordion emits `valueChangeRequest`, which can still cancel;
3. the accordion emits `valueChange`, the proposal: with `[(value)]` it lands when the binding writes it back; uncontrolled, core stores it after your listeners return, so `state()` read inside a `(valueChange)` listener still has the old value;
4. each item's panel settles and the item emits `openChangeComplete`. None on the first render.

Read the committed state from the accordion's or the item's `state()`, or the attributes. A parent writing `[value]` directly commits with no item or accordion request, and the panels' settle still emits `openChangeComplete`.

## Parts

| Directive            | `exportAs`           | Inputs                            | `state()`                   |
| -------------------- | -------------------- | --------------------------------- | --------------------------- |
| `uiAccordionHeader`  | `uiAccordionHeader`  | none                              | `{ open, disabled, index }` |
| `uiAccordionTrigger` | `uiAccordionTrigger` | `disabled`                        | `{ open, disabled, index }` |
| `uiAccordionPanel`   | `uiAccordionPanel`   | `keepMounted`, `hiddenUntilFound` | `{ open, disabled, index }` |

- **The header is your heading element**, for the page's outline: `<h3 uiAccordionHeader>`, at the level your page needs. The trigger goes inside it, on a `<button>`.
- **Parts go inside an item of the same accordion.** A header, trigger or panel finds its item through Angular's DI, and checks the item belongs to the nearest `uiAccordion`: a part placed straight inside a nested accordion, without its own item, throws `UiSdkError`. A part outside any item fails with Angular's own `NG0201`. Nested accordions with their own items work on their own.
- **The panel is structural.** Write `*uiAccordionPanel` on the panel's element. It's in the page while core has it there: open, closing (until its exit animation ends), kept or findable. A closed panel in the default mode isn't in the page, and its content, with any component state inside it, is destroyed; a kept or findable one keeps its content while hidden.
- **Per-panel options need the `<ng-template>` form**, since `*uiAccordionPanel="…; keepMounted: true"` would bind an input named `uiAccordionPanelKeepMounted`:

  ```html
  <ng-template uiAccordionPanel keepMounted>
    <div class="answer">…</div>
  </ng-template>
  ```

  Unset, the accordion's `keepMounted` and `hiddenUntilFound` apply; `false` on a panel overrides them.

- **One unconditional root element.** The panel's template renders exactly one element, the panel: put everything else, every `@if` and `@for` included, inside it. Two elements, text or no element throws `UiSdkError` when the panel first renders, in every build. The check runs when the panel's view is created, so it catches static siblings only: a top-level `@if` or `@for` beside the element renders outside the panel without an error.
- **Panels can't be composed through `hostDirectives`**: they need their template.

## Rules

- **Style by core's attributes**: `[data-open]`, `[data-closed]`, `[data-disabled]`, `[aria-expanded="true"]` on triggers, `[data-index]` on items, and `[data-starting-style]`/`[data-ending-style]` for transitions. Core sizes open panels with `--accordion-panel-height` and `--accordion-panel-width` once they bind.
- **Don't set `display` on a kept or findable panel's class**; scope it with `:not([hidden])`. Core's rule that hides `[hidden]` panels arrives at bind.
- **No arrow keys between triggers**: core beta.14's accordion has none. Tab moves between them.
- **`collapsible` off** keeps the one open item open: its trigger gets `aria-disabled="true"`. With nothing open at first, nothing opens until a press.
- **Core's quirks, kept as they are:** with `multiple` off, a `value` or `defaultValue` of several entries is kept as given on the first render and on controlled writes, while presses and the controller keep one. `disabled`, on the accordion or an item, stops presses only: `[value]`, the controller and find in page still open items.

## Server rendering

- Open items render their panel; closed ones only Angular's anchor comment, or the hidden element with `keepMounted` or `hiddenUntilFound`. Triggers render `aria-expanded` and, while disabled or locked open, `aria-disabled`.
- **At bind**, core adds what the server can't know: items' `data-index`, triggers' `aria-controls` for the panels in the page, the panels' size variables, and, inside a `<fieldset disabled>`, `aria-disabled` on triggers and `data-disabled` on every part.
- **A panel that opens in the browser** has its attributes and `data-starting-style` by its first frame. Code that runs synchronously between its insertion and the first write, like a directive constructor inside the panel, sees the element without core's attributes.
- **Find in page before hydration** reveals a findable panel's text without opening the item. The hidden state comes back when the panel hydrates or binds. After bind, a find opens the item with reason `"find-in-page"`, and canceling restores `until-found`.
- **A malformed panel template in a panel closed on the server** throws only when the panel first opens.
