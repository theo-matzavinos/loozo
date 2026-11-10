# Combobox

Combobox is a text input with a popup list of options, such as a country or a customer search: the [editable combobox with list autocomplete](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/). Typing writes `query` and opens the list; you filter the options by `query` and render only the matches. Focus stays in the input while the arrows and the pointer move a highlight through the options; choosing one writes its value, puts its label in the input and closes the list. The list is a [Popover](../popover/README.md), so it's presented in the native top layer, positioned against the input and dismissed like one. It's an [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) control, and it joins a [Field](../field/README.md) on its own.

[src/combobox/country.ts](../snippets/src/combobox/country.ts "playground")

| Directive           | Configuration                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ogCombobox`        | `value: T \| null` model (default `null`), `query: string` model (default `""`), `open: boolean` model (default `false`), `disabled` (default `false`)        |
| `ogComboboxInput`   | `id` (default generated); must be an `<input>`                                                                                                                |
| `ogComboboxTrigger` | `id` (default generated); optional; must be a `<button>`                                                                                                      |
| `ogComboboxContent` | `id` (default generated), `side` (default `block-end`), `align` (default `start`), `gap` (CSS px, default `0`), as on [Popover Content](../popover/README.md) |
| `ogComboboxOption`  | `value: T` (required), `label: string \| null` (default `null`), `disabled` (default `false`), `id` (default generated)                                       |

Put the input, the optional Trigger and Content inside the root, and the options inside Content:

```html
<div ogCombobox [(value)]="country" [(query)]="query">
  <input ogComboboxInput aria-label="Country" />
  <button ogComboboxTrigger aria-label="All countries">▾</button>
  <div ogComboboxContent>
    @for (c of matches(); track c.code) {
    <div ogComboboxOption [value]="c.code" [label]="c.name">{{ c.name }}</div>
    } @empty {
    <p>No country matches “{{ query() }}”.</p>
    }
  </div>
</div>
```

```ts
readonly query = signal("");
readonly matches = computed(() => COUNTRIES.filter((c) => startsWith(c.name, this.query())));
```

## Text and value

The input's text and the value are separate. `query` is the text; the value changes only when you choose an option or empty the input.

| What happens                                                                                                 | value                        | text in the input              |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------ |
| You type, paste or delete                                                                                    | unchanged; `null` once empty | what you typed; the list opens |
| You choose an option                                                                                         | the option's value           | the option's label             |
| The list closes without a choice: Escape, Tab, a click outside, the Trigger, focus moving to another element | unchanged                    | back to the committed text     |
| You write `query`                                                                                            | unchanged                    | your text, now committed       |
| You write `value`                                                                                            | your value                   | unchanged                      |

The committed text is the last chosen label, an empty string once the input was emptied, or the last `query` you wrote, such as the initial one, also from `queryChange` while the Combobox writes a choice. So typing a search and leaving puts the chosen option's name back, and typing an exact label without choosing it doesn't choose it.

Writing `open` false is a close without a choice too, also when you cancel the open that typing, an Arrow key or the button makes before the list shows, from `openChange` or a microtask later: the text goes back to the committed text and nothing stays highlighted. One exception: text typed before hydration stays when you write `open` true and then false yourself before Angular renders, with no user action between.

A `query` you write while the user types, from `queryChange` or later, such as a microtask after it, shows in the input once Angular renders, also when you reject the edit by writing back the text the input had before it. During an IME composition it shows once the composition ends.

Switching to another window, or a script calling the input's `blur()`, leaves the list open with your text; only focus moving to another element closes it. Both mark a bound field touched.

An option's label is its `label`, else its text with whitespace collapsed. Set `label` on options that show more than their name, such as a customer's email, or that text lands in the input.

**Writing the value yourself doesn't change the text.** The Combobox doesn't look labels up: the option may not be rendered for the current query, as with a server search. When you set the value from outside, write `query` with its label too:

```ts
// An edit page: the chosen customer isn't among the search results yet.
readonly query = signal(this.customer().name);
readonly results = injectQuery(() => ({ queryKey: ["customers", this.query()], ... }));
```

The same holds for a form `reset()`: reset the value and write `query` yourself, or the old label stays in the input and comes back on the next close.

- `open` is the requested state of the list. Typing, the opening keys and the Trigger open it; choosing and dismissal close it; you can write it yourself. Clicking or focusing the input doesn't open the list.
- `disabled` natively disables the input and the Trigger, so nothing opens, and an open list closes when the Combobox becomes disabled. Your own writes still apply.

## Filtering and search

The Combobox never filters: render the options that match `query` with `@for` or `@if`. Options that are hidden but still mounted can be highlighted and chosen, so don't filter with CSS.

For a server search, key the request on `query` and render its results as they arrive. New results are never highlighted by themselves, and Enter with nothing highlighted does nothing, so a search never chooses or submits on its own. An option that unmounts while highlighted stops being highlighted. Escape and Tab revert a typed search to the committed text, which also writes `query`, so your search runs again for it.

## Forms and Fields

```html
<div ogField #field="ogField">
  <label ogFieldLabel>Planet</label>
  <div ogCombobox [formField]="trip.planet" [(query)]="query">
    <input ogComboboxInput />
    <div ogComboboxContent>
      @for (p of matches(); track p.id) {
      <div ogComboboxOption [value]="p.id" [label]="p.name">{{ p.name }}</div>
      }
    </div>
  </div>
  <p ogFieldDescription>Where to?</p>
  @if (field.state.errorsShown()) {
  <p ogFieldError>{{ field.state.errors()[0]?.message }}</p>
  }
</div>
```

- **Signal Forms:** put `[formField]` on the root, not the input. It binds the `value` model, so a `number | null` field gives a number Combobox, writes `disabled` from the field's `disabled()` rules, and marks the field touched when focus leaves the input, also to another window. Opening, moving the highlight, choosing, Escape and presses on the Trigger and the list keep focus in the input, so they don't touch it; Tab away does. While the field is `readonly()`, the input is natively `readonly`, the arrows and the Trigger still open the list and move the highlight, but choosing writes nothing and leaves the list open. `focusBoundControl()` calls the root's `focus()`, which focuses the input.
- **Field:** inside an `ogField`, the input is the Field's control; don't add `ogFieldControl`. A `<label ogFieldLabel>` names it with `for`, so clicking the Label focuses the input, and the list takes the Field's Labels as its `aria-labelledby`. The input's `aria-describedby` names the Field's Descriptions, then its Errors, and `aria-invalid` and `aria-required` follow the Field. See [Field](../field/README.md).
- **Standalone:** without a Field, use `[(value)]` and name the input yourself. It keeps your static `aria-describedby`, `aria-required` and the like, and the list takes the input's static `aria-labelledby`, or else an `aria-label` written in the input's template. A bound `[attr.aria-label]` isn't copied: name Content yourself then.

To wrap the Combobox in your own component through `hostDirectives`, expose `value`, `valueChange`, `disabled` and `touch`, so `[formField]` on your component finds them, and usually `query` and `queryChange`. Signal Forms then calls `focus()` on your component, not on the Combobox, so give your component a `focus(options?: FocusOptions)` method that calls the injected `OrigamiCombobox`'s `focus(options)`; without it, `focusBoundControl()` focuses nothing.

## Values

`T` is a string, number or boolean, inferred from what you bind to `value`, as on [Select](../select/README.md#values): options compare their `value` with the Combobox's by `===`, without conversion, so bind `[value]="1"` for a number. `false` and `0` are values like any other; only `null` means nothing is chosen.

## Keyboard

Focus stays in the input throughout. Keys with Ctrl or Meta, keys already `defaultPrevented` and keys during IME composition are ignored; Alt counts only with the arrows.

| State  | Key                                  | Action                                                                                                      |
| ------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| either | characters, Backspace, Delete, paste | edit the text, write `query` and open the list with nothing highlighted                                     |
| closed | ArrowDown / ArrowUp                  | open, highlighting the chosen option, otherwise the first / last enabled one                                |
| closed | Alt+ArrowDown                        | open with nothing highlighted                                                                               |
| closed | Enter                                | nothing from the Combobox: a form's implicit submission still happens                                       |
| open   | ArrowDown / ArrowUp                  | the next / previous enabled option; it doesn't wrap; from nothing, the chosen option, else the first / last |
| open   | PageDown / PageUp                    | ten enabled options down / up, stopping at the ends                                                         |
| open   | Enter                                | choose the highlighted option and close; with nothing highlighted, nothing happens and no form submits      |
| open   | Escape, Alt+ArrowUp                  | close without a choice                                                                                      |
| open   | Tab, Shift+Tab                       | close without a choice; focus moves on                                                                      |
| either | Home, End, Left, Right, Space        | the input's own caret and text; Space never chooses                                                         |

Disabled options are skipped by every key. The Trigger has `tabindex="-1"`, so Tab never stops on it.

While an IME composition runs in the input, the keys and choosing wait for it to end, and so does any `query` write reaching the input.

## Pointer

A click on the Trigger opens or closes the list and puts focus in the input, also from another control and in Safari, which doesn't focus a clicked button; a list it opens highlights nothing. Moving the pointer over an enabled option highlights it; clicking one chooses it and closes the list, with focus still in the input. A press inside the list or on the Trigger never moves focus. A click outside closes the list without a choice and leaves focus where the browser puts it. Disabled options ignore the pointer.

## Sizing and scrolling

Content is [Popover Content](../popover/README.md#sizing-to-the-anchor): it exposes `--og-anchor-width`, the input's width, and `--og-available-height`, the room below or above it:

```css
[ogComboboxContent] {
  min-inline-size: var(--og-anchor-width);
  max-block-size: min(20rem, var(--og-available-height));
  overflow-y: auto;
}
```

As the keys move the highlight, the list scrolls its own scrolling box (the nearest one inside Content, or Content itself) to show the highlighted option. It never scrolls the page, and the pointer doesn't scroll it. Scope a custom `display` to `:popover-open` and use `gap`, not margins, as for any Popover.

## Inside a Dialog or a Popover

Nothing extra is needed. Inside a [Dialog](../dialog/README.md) or Popover Content, the first Escape and a click elsewhere in it close only the list, and choosing an option keeps the enclosing Popover open. Escape keeps focus in the input; a click elsewhere leaves focus where the browser puts it, on the body for text that isn't focusable.

## Replacing Options

The root, input, Trigger, Content and Option each have their own Options, `OrigamiComboboxOptions<T>`, `OrigamiComboboxInputOptions`, `OrigamiComboboxTriggerOptions`, `OrigamiComboboxContentOptions` and `OrigamiComboboxOptionOptions<T>`, with the fields in the table above, replaced as a whole with `provideExisting` or `provideFactory`. Other parts read an option's Options only once it has registered, after Angular set its inputs, so a replacement may use required inputs, also in options repeated with `@for`. A root replacement owns the value, so `[formField]` doesn't bind it: a component that replaces the root Options and takes `[formField]` declares its own `value` model. See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

## State and attributes

`OrigamiComboboxState<T>`, the root's `state`, has `value()`, the effective value, including `null` and values no option has; `query()`, the input's text; `open()`, whether the list is actually presented and interactive, not the requested `open`, false on the server and during an exit; and `disabled()`. It has no record of the chosen option: its label is in the input. Descendants of the root can inject it. The input and the Trigger have no `state`: read the root's through `#box="ogCombobox"`. Content's `state.open()` is its Presence retention, as on Popover Content. Each option has `OrigamiComboboxOptionState` as `state`: `selected()`, `active()` (highlighted, only while the list is presented) and `disabled()`.

| Element | Attributes                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input   | `role="combobox"`, `aria-autocomplete="list"`, `autocomplete="off"` (yours wins), `id`, `aria-expanded`, `aria-controls` (mounted Content), `aria-activedescendant` (the highlighted option, only while the list is presented), `value` (the query), native `disabled` and `readonly`; in a Field, `aria-describedby`, `aria-invalid`, `aria-required`                                             |
| Trigger | `type="button"`, `tabindex="-1"`, `id`, `aria-expanded`, `aria-controls`; the disabled attributes of [Button](../button/README.md)                                                                                                                                                                                                                                                                 |
| Content | `role="listbox"`, `id`, `aria-labelledby` (the input's, the Field's Labels, else your static one), `aria-label` (your static one, else the input's static one while there's no `aria-labelledby`; an `aria-labelledby` names the list over it), `popover="manual"`, `inert` while not presented, the [Presence](../presence/README.md) attributes, `--og-anchor-width` and `--og-available-height` |
| Option  | `role="option"`, `id`, `aria-selected` (`"true"` or `"false"`), `data-selected`, `data-active` while highlighted; when disabled, `aria-disabled="true"` and `data-disabled`                                                                                                                                                                                                                        |

## Accessibility

- Outside a Field you name the input with `aria-label` or `aria-labelledby`, and the Trigger with its own `aria-label`. Give options readable text and, where they show more than a name, a `label`.
- For a group of options, wrap them in your own `role="group"` with `aria-labelledby`; for a divider, use `role="separator"`. An empty-results message can sit in Content as plain markup.
- Not verified: macOS Safari, saved-profile autofill and password managers, physical IMEs and screen-reader speech.

## Server rendering and hydration

Server HTML has the list closed, the input's `role`, `aria-expanded="false"`, `aria-controls` and its text as a `value` attribute, the list's name and the options' `aria-selected`, and no `aria-activedescendant`. Hydration keeps the nodes and IDs. Text typed into the input before it hydrates, before the application starts or before a `@defer` block holding it hydrates, is kept: it becomes the query, the value doesn't change, and the replayed typing opens the list. It isn't committed: closing without a choice restores the server's text. Other keys pressed before hydration aren't promised.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

No multiple selection or chips, free-text values, built-in filtering, inline completion or automatic highlight, opening on focus or click, Clear part (emptying the input clears; your own button can write `null` and `""`), object values or comparator, group, separator, empty, loading or value parts, virtualization, wrapping or Home/End list navigation, or an always-visible inline list. No hidden native input, `name`, form submission or autofill of its own, and no `ControlValueAccessor`.
