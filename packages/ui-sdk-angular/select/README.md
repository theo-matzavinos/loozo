# Select

`@loozo/ui-sdk-angular/select`: a single-value select, core's `select`, from directives on elements you write: the root, its label, its trigger, the value, the content, item groups with their labels, each item, and the hidden input that takes part in a form.

```ts
import {
  UiSelect,
  UiSelectContent,
  UiSelectFormInput,
  UiSelectGroup,
  UiSelectGroupLabel,
  UiSelectItem,
  UiSelectLabel,
  UiSelectTrigger,
  UiSelectValue,
} from "@loozo/ui-sdk-angular/select";
```

```html
<div uiSelect name="fruit" [(value)]="fruit" (valueChangeRequest)="guard($event)" [loop]="true">
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
  <input uiSelectFormInput />
</div>
<button (click)="fruit.set(null)">Clear</button>

<!-- bound to a signal form field, in place of [(value)] -->
<div uiSelect [formField]="f.fruit">…</div>

<!-- a visible label, and items in named groups -->
<div uiSelect [(value)]="fruit">
  <span uiSelectLabel>Fruit</span>
  <button uiSelectTrigger>
    <span uiSelectValue #picked="uiSelectValue">{{ picked.state().label }}</span>
  </button>
  <div uiSelectContent>
    <div uiSelectGroup>
      <div uiSelectGroupLabel>Citrus</div>
      <div [uiSelectItem]="'lemon'" label="Lemon">Lemon</div>
      <div [uiSelectItem]="'lime'" label="Lime">Lime</div>
    </div>
  </div>
</div>
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
- **Behavior:** `loop`, `modal`, `presentation`, `disabled`, `readonly` (core's `readOnly`: opens, but doesn't change the value), `dismissible`, `controller`, `container`, `debug`.
- **Forms:** `name`, `form`, `required`, `autoComplete`, submitted through `uiSelectFormInput`; see [native forms](../README.md#native-forms).
- **Search and async lists**, for slots this release doesn't ship yet, so they have no visible effect: `filter`, `emptyItems`, `status`, `announcement`, the `query` family and the `loadMore` output.
- **Other outputs:** `openChangeComplete` (`boolean`), `highlight` (`{ value, details }`), `dismissAttempt` (core's details), and `touch` (`void`) when focus leaves the trigger and its popup, wherever the popup renders; opening it, moving through items and closing it back to the trigger don't count. Signal forms mark the field touched on it.
- **`focus(options?)`** focuses the trigger; signal forms' `focusBoundControl()` calls it. It takes effect once the trigger has rendered (call it after `afterNextRender` or from an event); earlier it does nothing. Core's focus takes no options, so `options` is ignored.

The root has no `state`; read the value through `uiSelectValue`.

## Parts

| Directive            | `exportAs`           | Inputs                                                                                                                          | `state()`                                             |
| -------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `uiSelectLabel`      | `uiSelectLabel`      | none                                                                                                                            | none                                                  |
| `uiSelectTrigger`    | `uiSelectTrigger`    | `disabled`, `controller`                                                                                                        | `{ open, disabled, readOnly, required, placeholder }` |
| `uiSelectValue`      | `uiSelectValue`      | `placeholder`, `maxLabels`, `getMoreLabel`                                                                                      | `{ value, label, labels, placeholder }`               |
| `uiSelectContent`    | `uiSelectContent`    | `side`, `align`, `sideOffset`, `alignOffset`, `collisionPadding`, `arrowPadding`, `anchor`, `container`, `alignItemWithTrigger` | `{ open, presentation, items, status }`               |
| `uiSelectItem`       | `uiSelectItem`       | `[uiSelectItem]` (its value, required, any type), `label`, `disabled`, `index`                                                  | `{ highlighted, selected, disabled }`                 |
| `uiSelectGroup`      | `uiSelectGroup`      | none                                                                                                                            | none                                                  |
| `uiSelectGroupLabel` | `uiSelectGroupLabel` | none                                                                                                                            | none                                                  |
| `uiSelectFormInput`  | `uiSelectFormInput`  | none                                                                                                                            | none                                                  |

`uiSelectLabel` goes inside the root's element and names the trigger; pressing it focuses the trigger without opening the popup, like a native select's label. `uiSelectGroup` goes inside the content, around its items and one `uiSelectGroupLabel`, which names it; the group hides while none of its items shows. An item inside a group belongs to it.

The content always stays in the DOM, hidden while closed; there's no exit animation before unmount yet.

Put `uiSelectFormInput` on an `<input>` inside the root's element. Core makes it a visually hidden text input whose value is the selected item's key (`itemToValue`, or the value itself), so it submits, resets, validates `required` and takes browser autofill.

## Rules

- **Name the trigger** with a `uiSelectLabel`, or a static `aria-label` or `aria-labelledby` on it, not both a label and an attribute. With a `uiSelectLabel` alone, the server HTML already points the trigger at it. With a `uiSelectLabel` and an `aria-label`, the trigger gets its `aria-labelledby` only when it binds, and the label's name wins. Named only by a `<label for>`, or not at all, its server HTML points `aria-labelledby` at a label that doesn't exist until it binds, and core warns about an unnamed trigger in development.
- **Some names settle at bind.** With a `uiSelectLabel`, the content is named by the trigger on the server and by the label once the label binds. A `uiSelectGroup` gets its `aria-labelledby` when its label binds, and a group whose items are written in the template renders `hidden` on the server until they bind; while the Select starts closed, both are on hidden content.
- **Put an authored trigger `id` before the content.** With `id="fruit-trigger"` on the trigger, the content's `aria-labelledby` names it from the server only when the trigger comes first in the template. Content written before it renders `aria-labelledby` with the generated trigger id, which no element has, until the trigger binds and core repairs it. While the Select starts closed, that reference is on hidden content. When it starts open, the server serves a visible listbox with that dangling name until hydration.
- **A Select that starts open settles when its trigger binds.** With `[defaultOpen]="true"` or `[open]="true"`, the server renders the listbox unpositioned, named by `aria-labelledby` pointing at the trigger. When the trigger binds, core positions it (`popover`, `style`, `data-side`, `data-align`, `data-starting-style`, `data-modality`) and names it with the trigger's accessible name as `aria-label` in place of `aria-labelledby`: the same name, in a different attribute. Until then the listbox sits where your CSS puts it. Start the Select closed to avoid both.
- **Object values need `itemToValue`** on the root: core keys items, and their element ids, by it; without it, two objects share the key `[object Object]`.
- **Server-correct labels need `itemToLabel` or `items`.** Without them, `state().label` is the raw value on the server and until the items register in the browser, then the item's `label`.
- **Style by core's attributes** on each part: `[data-highlighted]`, `[aria-selected="true"]`, `[data-disabled]`, `[data-open]`. Read `state()` from descendants or other elements, not from a binding on the part's own element.
- **Refuse a change with `valueChangeRequest`** (`details.cancel()`); not writing a controlled `value` back isn't a cancellation, and core warns in development after a second.
- **A kept item can change.** A `[disabled]` or `[label]` change reaches core's keyboard and pointer handling at once; a new value on a kept element (`track $index`) moves it to the new item, with no lost event.
- Keep the root and all its parts inside one `@defer (hydrate …)` block.
- **Under `[formField]`, an object field needs `itemToValue`** for its key and submission, and `itemToLabel` or `items` for a server-correct label, as with `[(value)]`. Resetting it to a new object with the same key selects the same item. See [signal forms](../README.md#signal-forms).

## Composing it

Through `hostDirectives`. To bind it with `[formField]`, expose what the field writes and `touch`, and forward `focus()`: Angular calls the composer's, not UiSelect's.

```ts
@Component({
  selector: "app-country",
  imports: [UiSelectTrigger, UiSelectValue, UiSelectContent, UiSelectItem],
  hostDirectives: [
    {
      directive: UiSelect,
      inputs: [
        "value",
        "disabled",
        "readonly",
        "required",
        "name",
        "items",
        "itemToValue",
        "itemToLabel",
      ],
      outputs: ["valueChange", "touch"],
    },
  ],
  template: `…trigger and content…`,
})
export class AppCountry {
  readonly #select = inject<UiSelect<Country>>(UiSelect);

  focus(options?: FocusOptions): void {
    this.#select.focus(options);
  }
}
```

## Known limitation

**A fast first press can open and then close a Select in an `@defer (hydrate on interaction)` block** (medium / possible). It happens when the block's code is already loaded, for instance because the page also uses a Select outside the block, and the press is shorter than the block's hydration.

1. Angular hydrates the block between the press's `pointerdown` and its `click`.
2. Angular hands the live `click` to the hydrated trigger, and core opens.
3. Angular then replays the earlier `pointerdown`, and core closes.

A second press works. Seen in Chromium, where the window was about 60 ms in this package's suite, and once in WebKit on a CI runner, where it's rare: WebKit inverts only when the live `click` lands between the block's hydration and the replay, which a local machine never hit. Firefox dispatches that `click` after the replay. A plain Angular `(pointerdown)` and `(click)` listener on the same trigger gets the same order, so the order is Angular's; this package hands events to core in the order Angular delivers them and doesn't reorder or drop them. The likelihood is an estimate: it needs a press faster than the hydration, which test tools' default clicks always are. The browser suite asserts this exact open-then-close for the fast press in Chromium, so it fails once Angular replays first, and the caveat can go; in WebKit it accepts either outcome.

## Not in this release

- `multiple`: one value only.
- `ControlValueAccessor`, template-driven and reactive forms; [signal forms](../README.md#signal-forms) are supported.
- The search input and core's other Select slots, like separators, the arrow and the clear button, and learning labels from item text.
