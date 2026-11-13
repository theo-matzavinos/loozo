# Select

`@loozo/ui-sdk-angular/select`: a single-value select, core's `select`, from five directives on elements you write: the root, its trigger, the value, the content and each item.

```ts
import {
  UiSelect,
  UiSelectContent,
  UiSelectItem,
  UiSelectTrigger,
  UiSelectValue,
} from "@loozo/ui-sdk-angular/select";
```

```html
<div uiSelect [(value)]="fruit" (valueChangeRequest)="guard($event)" [loop]="true">
  <button uiSelectTrigger aria-label="Fruit">
    <span uiSelectValue #shown="uiSelectValue">{{ shown.state().label || "Pick one" }}</span>
  </button>
  <div uiSelectContent>
    @for (option of fruits; track option.value) {
    <div
      class="option"
      [uiSelectItem]="option.value"
      [label]="option.label"
      [disabled]="option.soldOut"
    >
      {{ option.label }}
    </div>
    }
  </div>
</div>
<button (click)="fruit.set(null)">Clear</button>
```

```ts
readonly fruit = signal<string | null>("apple"); // null selects nothing and stays controlled

guard({ value, details }: UiSdkEvent<NonNullable<SelectOptions<string>["onValueChange"]>>) {
  if (value === null && details.reason === "clear-press") {
    details.cancel();
  }
}
```

`UiSdkEvent` comes from `@loozo/ui-sdk-angular`, `SelectOptions` from `@ui-sdk/core/select`.

## `uiSelect`

`exportAs: "uiSelect"`, generic over the value type `T` (`string` by default). Its inputs are core's `select` options:

- **Controlled keys:** `value` (`T | null`), `open`, `query`, each with `default<Key>` for the uncontrolled start and the two outputs `<key>ChangeRequest` (`{ value, details }`, cancelable) and `<key>Change`.
- **Items and values:** `items`, `itemToValue`, `itemToLabel`, `isItemEqualToValue`, `placeholder`.
- **Behavior:** `loop`, `modal`, `presentation`, `disabled`, `readOnly`, `dismissible`, `controller`, `container`, `debug`.
- **Search and async lists**, for slots this release doesn't ship yet, so they have no visible effect: `filter`, `emptyItems`, `status`, `announcement`, the `query` family and the `loadMore` output.
- **Other outputs:** `openChangeComplete` (`boolean`), `highlight` (`{ value, details }`), `dismissAttempt` (core's details).

The root has no `state`; read the value through `uiSelectValue`.

## Parts

| Directive         | `exportAs`        | Inputs                                                                                                                          | `state()`                                             |
| ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `uiSelectTrigger` | `uiSelectTrigger` | `disabled`, `controller`                                                                                                        | `{ open, disabled, readOnly, required, placeholder }` |
| `uiSelectValue`   | `uiSelectValue`   | `placeholder`, `maxLabels`, `getMoreLabel`                                                                                      | `{ value, label, labels, placeholder }`               |
| `uiSelectContent` | `uiSelectContent` | `side`, `align`, `sideOffset`, `alignOffset`, `collisionPadding`, `arrowPadding`, `anchor`, `container`, `alignItemWithTrigger` | `{ open, presentation, items, status }`               |
| `uiSelectItem`    | `uiSelectItem`    | `[uiSelectItem]` (its value, required, any type), `label`, `disabled`, `index`                                                  | `{ highlighted, selected, disabled }`                 |

The content always stays in the DOM, hidden while closed; there's no exit animation before unmount yet.

## Rules

- **Name the trigger** with a static `aria-label` or `aria-labelledby` on it. Named only by a `<label for>`, or not at all, its server HTML points `aria-labelledby` at a label that doesn't exist until it binds, and core warns about an unnamed trigger in development.
- **Put an authored trigger `id` before the content.** With `id="fruit-trigger"` on the trigger, the content's `aria-labelledby` names it from the server only when the trigger comes first in the template. Content written before it renders `aria-labelledby` with the generated trigger id, which no element has, until the trigger binds and core repairs it once. While the Select starts closed, that reference is on hidden content. When it starts open (`[defaultOpen]="true"` or `[open]="true"`), the server serves a visible listbox with that dangling name until hydration.
- **Object values need `itemToValue`** on the root: core keys items, and their element ids, by it; without it, two objects share the key `[object Object]`.
- **Server-correct labels need `itemToLabel` or `items`.** Without them, `state().label` is the raw value on the server and until the items register in the browser, then the item's `label`.
- **Style by core's attributes** on each part: `[data-highlighted]`, `[aria-selected="true"]`, `[data-disabled]`, `[data-open]`. Read `state()` from descendants or other elements, not from a binding on the part's own element.
- **Refuse a change with `valueChangeRequest`** (`details.cancel()`); not writing a controlled `value` back isn't a cancellation, and core warns in development after a second.
- **A kept item can change.** A `[disabled]` or `[label]` change reaches core's keyboard and pointer handling at once; a new value on a kept element (`track $index`) moves it to the new item, with no lost event.
- Keep the root and all its parts inside one `@defer (hydrate …)` block.

## Known limitation

**A fast first press can open and then close a Select in an `@defer (hydrate on interaction)` block** (medium / possible). It happens when the block's code is already loaded, for instance because the page also uses a Select outside the block, and the press is shorter than the block's hydration.

1. Angular hydrates the block between the press's `pointerdown` and its `click`.
2. Angular hands the live `click` to the hydrated trigger, and core opens.
3. Angular then replays the earlier `pointerdown`, and core closes.

A second press works. Seen in Chromium, where the window was about 60 ms in this package's suite. Firefox and WebKit dispatch that `click` after the replay. A plain Angular `(pointerdown)` and `(click)` listener on the same trigger gets the same order, so the order is Angular's; this package hands events to core in the order Angular delivers them and doesn't reorder or drop them. The likelihood is an estimate: it needs a press faster than the hydration, which test tools' default clicks always are. The browser suite asserts this exact open-then-close for the fast press in Chromium, so it fails once Angular replays first, and the caveat can go.

## Not in this release

- `multiple`: one value only.
- Native forms: `name`, `form`, `required` and `autoComplete` aren't inputs, and a form submission leaves the Select out; submit the bound value yourself. In development, a static `name` attribute on the root logs a warning.
- Angular Forms (`ControlValueAccessor`, signal forms): bind `[(value)]` to your own signal.
- SelectLabel, SelectGroup, the search input and core's other Select slots, and learning labels from item text.
