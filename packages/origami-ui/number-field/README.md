# Number field

A number field is a text input for a number, in the format of its locale: `1.234,50` in `el`, `1,234.50` in `en-US`. Its value is a `number` or `null`, never the text. You type into a native `<input>`, and ArrowUp, ArrowDown and optional Increment and Decrement buttons step the value. Origami formats and parses the text, keeps what you type within the locale's grammar, steps and owns the ARIA; you own the markup around it, such as a currency sign. It's an [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) control that reports half-typed numbers as parse errors and takes its bounds from the form's schema, and it joins a [Field](../field/README.md) on its own.

[src/number-field/deposit-amount.ts](../snippets/src/number-field/deposit-amount.ts "playground")

| Directive                | Configuration                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ogNumberField`          | `value: number \| null` model (default `null`), `locale` (default `LOCALE_ID`), `min`, `max` (stepping bounds, default none), `step` (default `1`), `minimumFractionDigits`, `maximumFractionDigits` (default `null`: `Intl.NumberFormat`'s, 0 and the larger of the minimum and 3), `useGrouping` (default `true`: the locale's group separators), `disabled`, `readonly` (default `false`) |
| `ogNumberFieldInput`     | none; a native `<input>`                                                                                                                                                                                                                                                                                                                                                                     |
| `ogNumberFieldIncrement` | none; a native `<button>` that steps up                                                                                                                                                                                                                                                                                                                                                      |
| `ogNumberFieldDecrement` | none; a native `<button>` that steps down                                                                                                                                                                                                                                                                                                                                                    |

```html
<div ogNumberField [(value)]="tickets" min="0" max="20" maximumFractionDigits="0">
  <button ogNumberFieldDecrement aria-label="Fewer tickets">−</button>
  <input ogNumberFieldInput aria-label="Tickets" />
  <button ogNumberFieldIncrement aria-label="More tickets">+</button>
</div>
```

The root is usually a wrapper element around the Input, the buttons and anything else you show, such as a `€` sign: it stays outside the text, so put it beside the Input with `aria-hidden="true"` and say it in the label. One Input per root. The Input is `type="text"` with the implicit `textbox` role, not a `spinbutton`. The buttons are optional and stay out of the tab order: keyboard users step with the arrows.

## Typing and keys

| Key or input                  | Effect                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Digits, the decimal separator | Typed as usual. The locale's own digits (`١٢٣` in `ar-EG`) and ASCII digits both type                                                                     |
| The group separator           | Typed as usual inside the integer part. A space-like one also types as U+0020, U+00A0 or U+202F; an apostrophe as `'` or `’`                              |
| `-`                           | A minus sign, only first. U+2212 and the locale's own also type one                                                                                       |
| Anything else                 | Undone: a letter, `+`, an exponent, a currency sign, a space around the number, a second decimal separator, a fraction digit past `maximumFractionDigits` |
| ArrowUp, ArrowDown            | Step the value by `step`, and move the caret to the end. With Alt, Ctrl, Meta or Shift they do what the browser does                                      |
| Home, End, PageUp, PageDown   | What the browser does: they don't step                                                                                                                    |
| Paste, drop, an input method  | Checked like typing; an input method is checked once, when its composition ends                                                                           |

An edit the grammar doesn't accept is undone before the next frame: the text and the selection, its direction included, go back to what they were. The browser's own `input` event has already been dispatched by then, so a listener of yours in the capture phase sees the rejected text first.

## Half-typed and misgrouped numbers

The field writes `value` while you type: whenever the text is a whole number, it's written at once, and emptying the text writes `null`. Anything else keeps the last value and reports a parse error:

- `{ kind: "numberIncomplete" }` for only a minus sign and/or a decimal separator (`-`, `,`);
- `{ kind: "numberInvalid" }` for group separators where the locale doesn't put them (`1.5` and `12.34` in `el`, a trailing `1.`).

So typing `1.500` in `el` writes `1` at the first key, then reports `numberInvalid` while the groups are incomplete, and writes `1500` at the last key: the value is always the last whole number you typed. Leaving the Input shows a whole number in the format (`1234,5` becomes `1.234,50`) without writing anything; a text with a parse error stays as you typed it.

Typed values are never clamped or rounded to a step: `-5` or `1500` is written as typed, and the form's `min()` and `max()` rules report it. Writing `value` replaces the text; writing the value it already has changes nothing, so use the form's `reset()` to throw a half-typed text away and keep the value. A value with more fraction digits than the field shows (`1.234` at two) shows rounded and stays until someone edits; leaving the Input doesn't write it, but typing its rounded text `1,23` over it writes `1.23`. A negative value that rounds to zero keeps its minus (`-0.001` at two shows `-0,00`); only `-0` itself shows as `0,00`. A value that isn't a finite number shows empty text and stays until someone edits. The field never writes `NaN`, `Infinity` or `-0`.

Without Signal Forms, read the same errors from `state.parseErrors()`. Origami ships no messages; map the kinds to your own.

## Stepping

ArrowUp and Increment step up by `step`, ArrowDown and Decrement down. A step goes to the next value on the grid of `min` (or 0) plus whole steps, in its direction: with `min="1"` and `step="3"` the grid is 1, 4, 7, 10 and so on, so up from `5` is `7` and down from `5` is `4`. It then stops at the bounds and never goes the other way: up does nothing at or above `max`, down at or below `min`, and down from `1500` with `max="1000"` is `1000`. From an empty field, up writes `min` (or 0) and down `max` (or 0), then clamped to the bounds: with `min="5"` and no `max`, down from empty writes `5`. A text with a parse error steps from the last value and is replaced. Decimal steps are exact: `0.1` steps from `0.2` to `0.3`. An integer steps exactly, so `1` steps from `1000000000000001` to `1000000000000002` or `1000000000000000`; any other value steps as its 15-significant-digit form, so a computed value's float noise doesn't count: `0.1` steps from `0.7 + 0.1` (`0.7999999999999999`, shown as `0,8`) to `0.9` or `0.7`, and from `0.1 + 0.2` (`0.30000000000000004`) to `0.4` or `0.2`.

The buttons are disabled at the bound they can't pass, and while the field is readonly, with `aria-disabled` and `data-disabled` but still focusable; while the field is disabled they're natively disabled. A step that isn't a positive number turns stepping off, and a step whose result would be past JavaScript's number range, or too small to change the value (`1` on `1e20`), does nothing. `min` above `max` isn't supported.

Pressing a button with the mouse keeps focus and the selection in the Input, or moves focus there, so typing can go on. A tap or a pen press is left to the browser: it steps, and focus goes wherever the browser puts it. Name each button with `aria-label` and give it its content: Origami ships no text.

## Format and locale

The text is `Intl.NumberFormat`'s decimal format for `locale`, with your `minimumFractionDigits`, `maximumFractionDigits` and `useGrouping`: the locale's digits, separators, minus sign and group sizes (`12,34,567` in `hi-IN`). `maximumFractionDigits="0"` takes whole numbers only: no decimal separator types. `inputmode` is `"decimal"` while fraction digits are allowed and `"numeric"` otherwise; the iOS keypads for both have no minus, so negative numbers come from stepping there. Changing `locale` or a format input shows the value again in the new format and throws a half-typed text away, without writing.

Currency, percent, units, compact and scientific notation, significant digits and rounding modes aren't supported: show a currency sign beside the Input. Precision is JavaScript's `Number`: digits past about 15 significant ones aren't kept exactly.

## Forms and Fields

<!-- prettier-ignore -->
```html
<div ogField #field="ogField">
  <label ogFieldLabel>Ποσό</label>
  <div ogNumberField [formField]="deposit.amount" minimumFractionDigits="2" maximumFractionDigits="2">
    <span aria-hidden="true">€</span>
    <input ogNumberFieldInput placeholder="0,00" />
  </div>
  @if (field.state.errorsShown()) {
    @switch (field.state.errors()[0]?.kind) {
      @case ("numberIncomplete") { <p ogFieldError>Συμπληρώστε το ποσό</p> }
      @case ("numberInvalid") { <p ogFieldError>Μη έγκυρο ποσό</p> }
      @case ("min") { <p ogFieldError>Το ποσό δεν μπορεί να είναι αρνητικό</p> }
      @case ("required") { <p ogFieldError>Υποχρεωτικό</p> }
    }
  }
</div>
```

```ts
readonly #model = signal({ amount: null as number | null });
readonly deposit = form(this.#model, (path) => {
  required(path.amount);
  min(path.amount, 0);
});
```

- **Signal Forms:** put `[formField]` on the root, for a `number | null` field. It binds the `value` model, writes `disabled` and `readonly` from the field's rules and `min` and `max` from its `min()` and `max()` rules, and marks the field touched when focus leaves the Input; pressing a button with the mouse doesn't. The parse errors come first in the field's errors, so `numberIncomplete` and `required` can both be there while a minus sits over an empty value. `focusBoundControl()` calls the root's `focus()`, which focuses the Input. Signal Forms owns `min` and `max` under `[formField]`: a static `min="0"` beside it doesn't compile, so put the bounds in the schema.
- **Field:** inside an `ogField`, the Input is the Field's control; don't add `ogFieldControl`. A `<label ogFieldLabel>` names it with `for`, so clicking the label focuses it, and its `aria-describedby` names the Descriptions, then the Errors. It carries `aria-invalid` while the Field shows its errors and `aria-required` while the field is required.
- **Standalone:** name the Input with `aria-label` or `aria-labelledby`, and bind `min` and `max` yourself.
- **Readonly and disabled:** a readonly Input is natively `readonly`: it still focuses, and typing and stepping change nothing. A disabled one is natively `disabled`, and `focus()` does nothing.

### Your own control

A directive that composes `ogNumberField` through `hostDirectives` and is itself the form control has its own `value` model and `min`, `max`, `disabled` and `readonly` inputs, provides the number field's Options from them, exposes the root's `touch` and forwards `focus()`, since Signal Forms calls it on the control it binds. The parse errors still reach the form.

```ts
@Directive({
  selector: "[appAmount]",
  hostDirectives: [{ directive: OrigamiNumberField, outputs: ["touch"] }],
  providers: [OrigamiNumberFieldOptions.provideExisting(() => Amount)],
})
export class Amount implements OrigamiNumberFieldOptions, FormValueControl<number | null> {
  readonly #field = inject(OrigamiNumberField);
  readonly value = model<number | null>(null);
  readonly min = input<number | undefined>(undefined);
  readonly max = input<number | undefined>(undefined);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly locale = computed(() => "el-GR");
  readonly step = computed(() => 0.5);
  readonly minimumFractionDigits = computed(() => 2);
  readonly maximumFractionDigits = computed(() => 2);
  readonly useGrouping = computed(() => true);

  focus(options?: FocusOptions): void {
    this.#field.focus(options);
  }
}
```

A replacement that owns the value without being the control, such as a `provideFactory` holding a plain `signal()`, works without `[formField]`; `[formField]` binds the model of the control it finds, not your signal.

## Server rendering and hydration

The server renders the text into the Input's `value` attribute, so the page shows `1.234,50` before any script runs. Hydration keeps it: the Input isn't written again. Text typed into the Input before its block hydrates is kept, and committed once when it has hydrated, or replaced with the value's text if typing couldn't have left it, without a write: Angular's replay of the typing doesn't edit again, and a composition from an input method that started before then and ends after it is checked when it ends; a button pressed before then steps once it has hydrated, and leaving the Input before then marks the field touched and shows a whole number in the format once it has hydrated, in the order they happened. If the browser's `Intl` formats differently from the server's, as WebKit's `de-CH` grouping apostrophe does, the server's text shows until the value changes or you leave the Input; both apostrophes parse.

Unsupported: an input-method composition still open when the block hydrates is checked as it stands then, and one that ends after the Input hydrated but before Angular replays its start (eager hydration while the app isn't stable yet) can leave the Input composing, so typing doesn't commit until the next composition ends.

## Not included

No `spinbutton` role, `aria-valuenow` or announcements of steps; no mouse wheel, press-and-hold repeat, Home/End/PageUp/PageDown or modifier steps; no clamping or rounding of typed values; no currency, percent, units or other notations; no `+` sign, exponent or numbers pasted in another locale's format; no `clear()` or stepping from code (write `value`); no hidden native input, `name`, form submission or autofill; no `ControlValueAccessor`; no `bigint` or decimal type. The acceptance checks the accessibility tree, not a screen reader, and simulated touch, not a device.
