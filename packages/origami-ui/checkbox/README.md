# Checkbox

Checkbox is a checkbox, such as "I accept the terms" or "Remember me", with an optional mixed state for select-all: a native button with `role="checkbox"` that flips a `checked` model. It's an [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) control, and it joins a [Field](../field/README.md) on its own.

[src/checkbox/accept-terms.ts](../snippets/src/checkbox/accept-terms.ts "both")

It has a `checked` model and a `mixed` model (both default `false`), a `disabled` input, a [`focusableWhenDisabled`](../button/README.md#focusable-when-disabled) input (both default `false`) and an `id` input (default generated). The indicator inside the button is yours; style it from `data-checked` and `data-mixed`.

## Mixed state and select-all

[src/checkbox/select-all.ts](../snippets/src/checkbox/select-all.ts "both")

Set `mixed` to show a select-all parent whose children are only partly selected: `aria-checked="mixed"` and `data-mixed`, without `data-checked`, so a check and a minus never show together. A click, Space or a Label click from mixed writes `mixed` false, then `checked` true, so your `(checkedChange)` handler runs with `mixed()` already false. The Checkbox never sets `mixed` true; you do.

`checked` and `mixed` are models the Checkbox writes, also when you bind them one-way. Angular re-applies a binding only when its value changes, so after a click your `[mixed]="some()"` puts mixed back only if `some()` changes.

Derive `all()` and `some()` over the children your handler can change, and say so in the parent's label. If they include a child the handler can't change, such as a disabled one, a click leaves `all()` unchanged and the parent shows checked over a partial selection until the next click. Two-way bindings, `linkedSignal` and writing the directive's models from the handler don't change that.

```ts
readonly vehicles = [
  { id: "car", disabled: false },
  { id: "van", disabled: false },
  { id: "bus", disabled: true },
];
readonly selected = signal<ReadonlySet<string>>(new Set(["car"]));
/** The children selectAll can change. */
readonly selectable = computed(() => {
  const ids: string[] = [];

  for (const vehicle of this.vehicles) {
    if (!vehicle.disabled) {
      ids.push(vehicle.id);
    }
  }

  return ids;
});
readonly count = computed(() => {
  let count = 0;

  for (const id of this.selectable()) {
    if (this.selected().has(id)) {
      count++;
    }
  }

  return count;
});
readonly all = computed(() => this.selectable().length > 0 && this.count() === this.selectable().length);
readonly some = computed(() => this.count() > 0 && !this.all());

selectAll(checked: boolean): void {
  const next = new Set(this.selected());

  for (const id of this.selectable()) {
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
  }

  this.selected.set(next);
}
```

```html
<div ogField>
  <button
    ogCheckbox
    aria-controls="vehicle-car vehicle-van vehicle-bus"
    [checked]="all()"
    [mixed]="some()"
    [disabled]="selectable().length === 0"
    (checkedChange)="selectAll($event)"
  ></button>
  <label ogFieldLabel>Select all available vehicles</label>
</div>
```

Mixed isn't remembered: the next parent click from unchecked checks all. `aria-controls` is yours to set.

## Forms and Fields

- **Signal Forms:** put `[formField]` on the Checkbox. It binds the `checked` model, writes `disabled` from the field's `disabled()` rules, and marks the field touched when the Checkbox loses focus. `required()` fails while it's unchecked. While the field is `readonly()`, clicks and Space don't change it. `focusBoundControl()` focuses the button.
- **Field:** inside an `ogField`, a `<label ogFieldLabel>` names the Checkbox through `for`, before or after it, and clicking the label toggles it. Don't add `ogFieldControl`. The Checkbox's `aria-describedby` names the Field's Descriptions and Errors, merged with a co-applied Tooltip Trigger's Content; it binds `aria-invalid="true"` while the Field shows errors, and `aria-required` and `aria-readonly` from the bound field. See [Field](../field/README.md).
- **Standalone:** without a Field, use `[(checked)]` and give the button its name with `aria-label` or your own `aria-labelledby`. It binds its `id` and keeps your static ARIA attributes.
- **Mixed:** `[formField]` binds `checked` only. `mixed` is yours: `required()` reads `checked`, so a mixed Checkbox whose `checked` is false fails it, and `reset()`, readonly and disabled don't touch `mixed`. Readonly and disabled block the activation that would clear it.

`[mixed]="true"` doesn't pin the Checkbox mixed. A click clears it, and setting the form value back to false shows unchecked, because the constant didn't change. To restore mixed, write a signal bound with `[(mixed)]`:

```ts
// <button ogCheckbox [formField]="signup.newsletters" [(mixed)]="someNewsletters"></button>
resetNewsletters(): void {
  this.model.update((model) => ({ ...model, newsletters: false }));
  this.someNewsletters.set(true);
}
```

To wrap the Checkbox in your own component through `hostDirectives`, expose `checked`, `checkedChange`, `disabled` and `touch`, so `[formField]` on your component finds them, and `mixed` and `mixedChange` to use the mixed state.

## Replacing Options

`OrigamiCheckboxOptions` has `checked`, `mixed`, `disabled`, `focusableWhenDisabled` and `id`. A replacement owns the value, so `[formField]` doesn't bind it: a component that replaces the Options and takes `[formField]` declares its own `checked` model. See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

## State and attributes

`OrigamiCheckboxState` has `checked()`, `mixed()` and `disabled()`, the effective values from the Options; `checked()` is the underlying value, also while mixed. The directive exposes it as `state`, and descendants of the button can inject it.

| Element  | Attributes                                                                                                                                                                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Checkbox | `type="button"`, `role="checkbox"`, `id`, `aria-checked` (`"true"`, `"false"` or `"mixed"`), `data-checked` while checked and not mixed, `data-mixed` while mixed; when disabled, `aria-disabled="true"`, `data-disabled` and, unless `focusableWhenDisabled`, native `disabled`; in a Field, the ARIA attributes listed above |

## Accessibility

- A click or Space toggles it; Enter doesn't, as the [ARIA checkbox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/) says. There's no custom keyboard handling beyond that.
- While disabled, user clicks can't change it, but your own writes to the model, Options or form still apply. A focusable disabled Checkbox stays in the Tab order, and your own `(click)` listeners on it still run.
- `aria-checked` is `"mixed"` while mixed, else `"true"` or `"false"`. A click, Space or a Label click from mixed checks it. Content inside the button is presentational, so a decorative indicator is fine.
- It's a button, not an `<input>`: it isn't submitted with a native `<form>`, and `:checked` and `:invalid` don't apply. Style from `data-checked` and the Field's `data-invalid`. Don't add another button primitive to its button.

## Server rendering and hydration

The `id`, `role`, `aria-checked`, `data-checked`, `data-mixed`, the disabled attributes, the Label's `for` and the Field's ARIA are in the server HTML, and hydration keeps them. A click from mixed before hydration is replayed once. What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

No checkbox group or parent–child coordination (build select-all from Checkboxes, as above), remembered partial selection, hidden `<input>` or native form submission.
