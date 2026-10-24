# Select

Select is a list that opens from a button, such as a country or a status: the [select-only combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/) pattern. Focus stays on the button while the keys, the pointer and typeahead move a highlight through the options; choosing one writes the value and closes the list. `ogSelectMultiple` is the same list for several values, where choosing toggles an option and keeps the list open ([Multiple selection](#multiple-selection)). The list is a [Popover](../popover/README.md), so it's presented in the native top layer, positioned against the button and dismissed like one. It's an [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) control, and it joins a [Field](../field/README.md) on its own.

[src/select/country.ts](../snippets/src/select/country.ts "playground")

| Directive          | Configuration                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ogSelect`         | `value: T \| null` model (default `null`), `open: boolean` model (default `false`), `disabled` (default `false`)                                              |
| `ogSelectMultiple` | `value: readonly T[]` model (default `[]`), `open: boolean` model (default `false`), `disabled` (default `false`)                                             |
| `ogSelectTrigger`  | `id` (default generated), `disabled`, [`focusableWhenDisabled`](../button/README.md#focusable-when-disabled) (both default `false`); must be a `<button>`     |
| `ogSelectContent`  | `id` (default generated), `side` (default `block-end`), `align` (default `start`), `gap` (CSS px, default `0`), as on [Popover Content](../popover/README.md) |
| `ogSelectOption`   | `value: T` (required), `label: string \| null` (default `null`), `disabled` (default `false`), `id` (default generated)                                       |

Put the Trigger and Content inside the root, `ogSelect` or `ogSelectMultiple`, and the options inside Content. The Trigger's text is yours, with a placeholder while nothing is selected: under `ogSelect` render it from `state.selectedOption()?.label` or `state.value()`, under `ogSelectMultiple` from `state.selectedOptions()` or `state.value().length` ([Multiple selection](#multiple-selection)).

- The value is yours. Only choosing an option writes it: a click, or Enter or Space on the highlighted option. Escape, Tab and a click outside close without writing. Under `ogSelect`, `null` or a value no option has selects nothing and is kept, and removing the selected option doesn't change the value; `ogSelectMultiple`'s rules are under [Multiple selection](#multiple-selection).
- `open` is the requested state of the list. Opening and dismissal write it, and you can write it yourself; a list opened that way has no highlighted option until a key moves one.
- `disabled` natively disables the Trigger, so the list can't open, and an open list closes when the Select becomes disabled. Your own writes still apply.

## Forms and Fields

```html
<div ogField #field="ogField">
  <span ogFieldLabel>Priority</span>
  <div ogSelect #priority="ogSelect" [formField]="todo.priority">
    <button ogSelectTrigger>{{ priority.state.selectedOption()?.label ?? "Choose" }}</button>
    <div ogSelectContent>
      <div ogSelectOption [value]="1" label="Low">Low</div>
      <div ogSelectOption [value]="2" label="High">High</div>
    </div>
  </div>
  <p ogFieldDescription>How urgent is it?</p>
  @if (field.state.errorsShown()) {
  <p ogFieldError>{{ field.state.errors()[0]?.message }}</p>
  }
</div>
```

- **Signal Forms:** put `[formField]` on the root, not the Trigger. It binds the `value` model, so a `number | null` field gives a number Select, writes `disabled` from the field's `disabled()` rules, and marks the field touched when focus leaves the Trigger. Opening the list, moving the highlight, choosing and Escape keep focus on the Trigger, so they don't touch it; Tab away does. While the field is `readonly()`, the list still opens and the highlight still moves, but choosing writes nothing and leaves the list open; Escape closes it. `focusBoundControl()` calls the root's `focus()`, which focuses the Trigger.
- **Field:** inside an `ogField`, the Trigger is the Field's control; don't add `ogFieldControl`. Give it a Label on any element, such as `<span ogFieldLabel>`, before or after the Select: the Trigger's `aria-labelledby` names every Label of its Field, replacing a static one, and the list takes the same `aria-labelledby`. A Label doesn't name it with `for`, so clicking the Label does nothing, as with a [RadioGroup](../radio-group/README.md). The Trigger's `aria-describedby` names the Field's Descriptions, then its Errors, together with a [Tooltip](../tooltip/README.md) on the same button, and `aria-invalid`, `aria-required` and `aria-readonly` follow the Field. See [Field](../field/README.md).
- **Standalone:** without a Field, use `[(value)]` and name the Trigger yourself. It keeps your static `aria-labelledby`, `aria-describedby`, `aria-required` and the like, and the list takes the Trigger's `aria-labelledby`, or else an `aria-label` written in the Trigger's template. A bound `[attr.aria-label]` isn't copied: name Content yourself then, with `aria-label` or a static `aria-labelledby`.

To wrap the Select in your own component through `hostDirectives`, expose `value`, `valueChange`, `disabled` and `touch`, so `[formField]` on your component finds them. Signal Forms then calls `focus()` on your component, not on the Select, so give your component a `focus(options?: FocusOptions)` method that calls the injected root's `focus(options)`, `OrigamiSelect`'s or `OrigamiSelectMultiple`'s; without it, `focusBoundControl()` focuses nothing.

## Multiple selection

```html
<div ogSelectMultiple [(value)]="toppings" #pick="ogSelectMultiple">
  <button ogSelectTrigger aria-label="Toppings">
    @switch (pick.state.value().length) { @case (0) { Any topping } @case (1) { {{
    pick.state.selectedOptions()[0]?.label }} } @default { {{ pick.state.value().length }} selected
    } }
  </button>
  <div ogSelectContent>
    <div ogSelectOption value="olives" label="Olives">Olives</div>
    <div ogSelectOption value="basil" label="Basil">Basil</div>
  </div>
</div>
<button type="button" (click)="toppings.set([])">Clear</button>
```

`ogSelectMultiple` shares the Trigger, Content and options with `ogSelect`; only the root differs.

- Enter, Space and a click toggle the highlighted or clicked option and keep the list open. The arrows, Home, End, PageUp, PageDown and typeahead only move the highlight. Escape, Tab, a click outside and a click on the Trigger close the list. Nothing is undone on close, and there's no Apply step.
- Opening highlights the first selected option in the list's order, else the first enabled one. Enter with nothing highlighted, as after an `open` write, closes the list without writing, as under `ogSelect`.
- A toggle appends the value at the end of a new array or removes it into a new array, keeping every other value, including values no option has, in order. Removing an option never removes its value.
- The Trigger's text is yours: read `state.value().length` for a count and `state.selectedOptions()` for the labels, as above. `data-placeholder` is on the Trigger while the value is empty. To clear, write `[]` from your own button next to the Trigger.
- With `[formField]` it binds an array field of strings, numbers or booleans, such as `number[]`, with everything [Forms and Fields](#forms-and-fields) describes; readonly opens and highlights but never toggles. Signal Forms' `required()` doesn't treat an empty array as missing, so add `minLength(path.toppings, 1)` when a choice is needed.
- Content has `aria-multiselectable="true"`, and each option keeps `aria-selected="true"` or `"false"`. A multiselectable listbox behind a combobox is valid ARIA, but it isn't an APG pattern, and how NVDA and VoiceOver announce it hasn't been verified.

There's no select-all or Ctrl+A, Shift range selection, chips or Clear part.

## Values

`T` is a string, number or boolean, inferred from what you bind to `value`, so a `signal<number | null>` gives a number Select and `valueChange` emits numbers. Options compare their `value` with the Select's by `===`, without conversion: an option with `value="1"` is the string `"1"` and never matches the number `1`; bind `[value]="1"` instead. Angular doesn't check an option's type against the Select's, so a mismatch shows up only as an option that is never selected. `false` and `0` are values like any other; only `null` means nothing is selected.

Every option needs an explicit `value`. Values should be distinct; every option whose value is the Select's value is selected.

## Keyboard

The Trigger keeps focus throughout. Keys with Alt, Ctrl or Meta, keys already `defaultPrevented` and keys during IME composition are ignored.

| State  | Key                              | Action                                                                                                                                    |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| closed | Enter, Space, ArrowDown, ArrowUp | open, highlighting the selected option, otherwise the first enabled one                                                                   |
| closed | Home / End                       | open on the first / last enabled option                                                                                                   |
| closed | a character                      | open on the first enabled option that starts with it                                                                                      |
| open   | ArrowDown / ArrowUp              | the next / previous enabled option; it doesn't wrap                                                                                       |
| open   | Home / End                       | the first / last enabled option                                                                                                           |
| open   | PageDown / PageUp                | ten enabled options down / up, stopping at the ends                                                                                       |
| open   | characters                       | typeahead: the next option whose label starts with what you typed; repeating one character cycles through them                            |
| open   | Enter, Space                     | choose the highlighted option and close (toggle it and stay open under `ogSelectMultiple`); Space types a space while a search is running |
| open   | Escape                           | close without choosing                                                                                                                    |
| open   | Tab, Shift+Tab                   | close without choosing; focus moves on                                                                                                    |

Typeahead matches the start of an option's `label`, else its text, ignoring case. Characters typed within 500 ms of each other form one search. Disabled options are skipped by every key.

## Pointer

A click on the Trigger opens or closes the list and focuses the Trigger, also in Safari, which doesn't focus a clicked button. Moving the pointer over an enabled option highlights it; clicking one chooses it and closes the list (under `ogSelectMultiple`, toggles it and keeps the list open), with focus still on the Trigger. A press inside the list never moves focus. Disabled options ignore the pointer.

## Sizing and scrolling

Content is [Popover Content](../popover/README.md#sizing-to-the-anchor): it exposes `--og-anchor-width`, the Trigger's width, and `--og-available-height`, the room below or above it, so a list can match its Trigger and scroll instead of overflowing the viewport:

```css
[ogSelectContent] {
  min-inline-size: var(--og-anchor-width);
  max-block-size: min(20rem, var(--og-available-height));
  overflow-y: auto;
}
```

When the list opens, and as the keys move the highlight, the list scrolls its own scrolling box (the nearest one inside Content, or Content itself) to show the highlighted option. It never scrolls the page. The pointer doesn't scroll it. Scope a custom `display` to `:popover-open` and use `gap`, not margins, as for any Popover.

## Inside a Dialog or a Popover

Nothing extra is needed. Inside a [Dialog](../dialog/README.md) the first Escape and a click elsewhere in the dialog close only the list, and inside Popover Content they close only the list, too; choosing an option keeps the enclosing Popover open. When the Dialog or Popover closes with the list open, the list closes with it and keeps its requested `open`, so it's presented again when they reopen, with no option highlighted. A [Tooltip](../tooltip/README.md) Trigger can share the button with `ogSelectTrigger`; the Tooltip closes when the button is pressed.

## Options that come and go

Content stays mounted while the list is closed, so its options are registered from the start: the selected option's label, typeahead on the closed Trigger and the keys all work before the list first opens. Options inside `@for`, `@if` or `@defer` register once Angular has set their inputs and unregister when they're destroyed. An option that isn't mounted, or that is in a `@defer` block that hasn't hydrated yet, can't be highlighted or chosen and has no `selectedOption()` or `selectedOptions()` record; nothing is written meanwhile.

Every option is a mounted directive even while the list is closed, so rendering and hydration grow with the number of options. For a very long list you can render the options only while it's open, with `@if (content.state.open())` on a `#content="ogSelectContent"` reference, at the cost of typeahead on the closed Trigger and of `selectedOption()` or `selectedOptions()` while it's closed.

## Replacing Options

The root, Trigger, Content and Option each have their own Options, `OrigamiSelectOptions<T>` (`OrigamiSelectMultipleOptions<T>` for `ogSelectMultiple`, whose `value` is a `WritableSignal<readonly T[]>`), `OrigamiSelectTriggerOptions`, `OrigamiSelectContentOptions` and `OrigamiSelectOptionOptions<T>`, with the fields in the table above, replaced as a whole with `provideExisting` or `provideFactory`. Other parts read an option's Options only once it has registered, after Angular set its inputs, so a replacement may use required inputs, also in options repeated with `@for`. A directive that composes `ogSelectOption` through `hostDirectives` must expose its required `value`, and its template must bind it, even when the directive's replacement Options supply the value; Angular requires both. A root replacement owns the value, so `[formField]` doesn't bind it: a component that replaces the root Options and takes `[formField]` declares its own `value` model. See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

## State and attributes

`OrigamiSelectState<T>`, the root's `state`, has:

- `value()`: the effective value, including `null` and values no option has.
- `open()`: whether the list is actually presented and interactive, not the requested `open`; false on the server and during an exit.
- `disabled()`: the root's effective disabled policy.
- `selectedOption()`: the registered option that has the value, as a plain `OrigamiSelectOptionRecord<T>` (`{ value, label, disabled }`), or `null` while the value is `null` or no registered option has it. `label` is the option's explicit `label`, never its text, so set `label` on options whose name the Trigger shows. With several matches, the first registered one wins. It's ready in server HTML and in the first render after the options register.

`OrigamiSelectMultipleState<T>`, the `ogSelectMultiple` root's `state`, has `value()` (a readonly array in its own order), `open()` and `disabled()` as above, and `selectedOptions()`: the same records in value order, one per value that a registered option has, the first registered one for each, leaving out values no registered option has.

Descendants of the root can inject its State. The Trigger has no `state`: read the root's through `#select="ogSelect"` or `#pick="ogSelectMultiple"`. Content's `state.open()` is its Presence retention, as on Popover Content, for gating children through an exit animation. Each option has `OrigamiSelectOptionState` as `state`: `selected()`, `active()` (highlighted, only while the list is presented) and `disabled()`; descendants of an option can inject it.

| Element | Attributes                                                                                                                                                                                                                                                                                                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger | `type="button"`, `role="combobox"`, `id`, `aria-expanded`, `aria-controls` (mounted Content), `aria-activedescendant` (the highlighted option, only while the list is presented), `data-placeholder` while nothing is selected; the disabled attributes of [Button](../button/README.md); in a Field, `aria-labelledby`, `aria-describedby`, `aria-invalid`, `aria-required`, `aria-readonly` |
| Content | `role="listbox"`, `id`, `aria-labelledby` (the Trigger's, else your static one), `aria-label` (your static one, else the Trigger's static one while there's no `aria-labelledby`), `aria-multiselectable="true"` under `ogSelectMultiple`, `popover="manual"`, `inert` while not presented, the [Presence](../presence/README.md) attributes, `--og-anchor-width` and `--og-available-height` |
| Option  | `role="option"`, `id`, `aria-selected` (`"true"` or `"false"`), `data-selected`, `data-active` while highlighted; when disabled, `aria-disabled="true"` and `data-disabled`                                                                                                                                                                                                                   |

## Accessibility

- Outside a Field you supply the Trigger's accessible name with `aria-label` or `aria-labelledby`; its text is announced as the value. The Trigger's `aria-labelledby` also names the list; without one, an `aria-label` written in the Trigger's template does, unless Content has its own `aria-label` or `aria-labelledby` written in its template, which win. A bound `[attr.aria-label]` on the Trigger isn't copied, so name Content yourself then. Names a directive that composes Content through `hostDirectives` writes in its `host` aren't kept; write them where the element is used instead. Give options readable text and, where the Trigger shows a shorter name, a `label`.
- For a group of options, wrap them in your own `role="group"` with `aria-labelledby`; for a divider, use `role="separator"`. Both work inside Content as plain markup.

## Server rendering and hydration

Server HTML has the list closed, the Trigger's `role`, `aria-expanded="false"`, `aria-controls`, the list's name, the options' `aria-selected` and your Trigger text, including a label from `selectedOption()` or `selectedOptions()`, and no `aria-activedescendant`; inside a Field, also the Trigger's and the list's `aria-labelledby` and the Trigger's `aria-describedby`, `aria-invalid` and `aria-required`. Hydration keeps the nodes and IDs. A click on the Trigger replayed after incremental hydration opens the list once.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

No object values or comparator, clear button, select-all, range selection, chips, option groups or separators as parts, value or indicator parts, item-aligned positioning, scroll buttons or virtualization. No hidden native `<select>`, `name`, form submission or autofill, and no `ControlValueAccessor`.
