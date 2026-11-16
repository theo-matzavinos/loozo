# OTP field

An OTP field is a one-time code or PIN, typed into one native `<input>` that you draw as a row of cells. Its value is a string of ASCII digits, `""` when empty, never a number, so a leading zero stays. The input is the one named, focusable control: it holds the whole code, and its caret, selection, undo, paste, autofill and input methods are the browser's. You lay it transparently over cells you render from `state.cells()`, and the cells only mirror it. Origami reads every edit as a code, maps a click to the cell under it, masks a PIN and owns the ARIA; you own the cells and their styles. It's an [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) control, and it joins a [Field](../field/README.md) on its own.

[src/otp-field/verification-code.ts](../snippets/src/otp-field/verification-code.ts "playground")

| Directive         | Configuration                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ogOtpField`      | `value: string` model (default `""`), `length` (default `6`: digits and cells), `mask` (default `false`: a PIN, the input a password field), `disabled`, `readonly` (default `false`) |
| `ogOtpFieldInput` | none; a native `<input>`                                                                                                                                                              |

```html
<div
  ogOtpField
  #otp="ogOtpField"
  class="otp"
  [class.focused]="otp.state.focused()"
  [(value)]="code"
>
  <input ogOtpFieldInput aria-label="Verification code" />
  <div class="cells" aria-hidden="true">
    @for (cell of otp.state.cells(); track cell.index) {
    <span class="cell" [class.caret]="cell.caret" [class.selected]="cell.selected"
      >{{ cell.char }}</span
    >
    }
  </div>
</div>
```

One Input per root. The cells are yours and must be `aria-hidden`: the Input is what a screen reader reads, so cells it could also read would announce each digit twice, or a PIN's digits at all. Origami ships no cell part and no styles.

## The layout

The Input covers the cells and is invisible: no text, caret, selection or outline of its own. Its glyphs, at 1px, stay in the first cell, so they never show through, and a click lands on the cell under it because the Input maps clicks to equal slots of its width. The cells are the only feedback, so style the caret, the selection and the focus:

```css
.otp {
  position: relative;
  inline-size: max-content;
}
.otp input {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  margin: 0;
  padding: 0;
  color: transparent;
  caret-color: transparent;
  background: transparent;
  border: 0;
  outline: none;
  font-size: 1px;
}
.otp input::selection {
  background: transparent;
  color: transparent;
}
.otp .cells {
  display: flex;
  gap: 8px;
}
.cell.caret {
  border-color: var(--accent);
} /* the next digit goes here */
.cell.selected {
  background: var(--selection);
} /* typing replaces it */
.otp.focused .cells {
  outline: 2px solid var(--focus);
} /* a full code, caret at its end */
```

Each record of `state.cells()` has `index`, `char` (the digit, `null` when empty and in every cell while masked), `filled`, `caret` (the focused Input's collapsed caret is here) and `selected` (its selection covers the cell). In a full code with the caret at its end no cell is `caret`, since nothing more can be typed: draw the focus from `state.focused()`, as above. Cells of equal width with an equal gap are what the click mapping assumes; separators, grouped layouts (`123 456`) and uneven widths aren't supported. On a right-to-left page, put `dir="ltr"` on the root.

## Typing, keys and paste

| Input                                        | Effect                                                                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Digits                                       | Typed at the caret, up to `length`. Full-width digits (`１２３`) type their ASCII digits                                                                        |
| Spaces, `-` and other dashes                 | Dropped: `123 456` and `12-34-56` type `123456`                                                                                                                 |
| A letter, a seventh digit                    | Nothing: the keystroke is cancelled before it lands, so the text, the selection and undo stay as they were                                                      |
| A digit into a full code                     | Nothing at a collapsed caret: select the digit first, by clicking its cell or with Shift+arrows, and the next digit replaces it                                 |
| Arrows, Backspace, Delete, Home, End, Ctrl+A | What the browser does. Deleting a middle digit shifts the later ones left: the code has no gaps                                                                 |
| Enter                                        | Submits the form natively                                                                                                                                       |
| Paste                                        | A whole code (`987 654`, `９８７６５４` too) replaces the field; a shorter one goes at the selection if the result fits; anything else does nothing. Undo works |
| An input method                              | Checked once, when its composition ends                                                                                                                         |
| Autofill, drop                               | Checked like typing. An over-long fill (`1234567890`) is undone, not cut                                                                                        |

Every edit is read with Unicode NFKC and without whitespace and dashes, and kept only if what's left is ASCII digits, at most `length` of them. NFKC also maps compatibility digits to the digits they denote (`①` and `²` type `1` and `2`); `½`, Arabic-Indic digits and letters don't. A rejected keystroke is cancelled in its `beforeinput`, so it fires no `input` and leaves the browser's undo history intact. Autofill, a drop and an input method can't be cancelled: when one is rejected, its own `input` event has already been dispatched when it's undone, so a capture-phase listener of yours sees the rejected text first, and the browser forgets the undo history before it.

A click on a filled cell selects its digit; on an empty cell it puts the caret at the end of the code. A double-click selects the whole code. A click with Shift or another modifier, a right click, a click that moved more than 4 CSS px and a drag are the browser's: dragging doesn't select a run of cells.

## Masking and autofill

`mask` makes the Input `type="password"` and leaves `char` null in every record, so a PIN's digits can't reach a cell: draw a dot from `filled`. Don't render `state.value()` into the cells while masked.

The Input's `autocomplete` is `one-time-code` by default, which lets supporting devices offer a code from a message. A PIN isn't a one-time code: write `autocomplete="new-password"` on a screen that sets a PIN and `current-password` on one that asks for it, statically or bound. `inputmode` is `numeric`, so phones show a digit keyboard.

## Reacting to a complete code

There's no completion event. `valueChange` fires synchronously inside each edit that changes the code, after the model holds it, so a handler that reads `state.complete()` there reacts to every completed edit, typed, pasted, autofilled or composed:

```html
<div
  ogOtpField
  #otp="ogOtpField"
  [value]="code()"
  (valueChange)="code.set($event); otp.state.complete() && verify($event)"
>
  …
</div>
```

A value your application writes never emits. A writer of yours that should complete the code, such as an on-screen keypad or a WebOTP handler, checks it itself, exactly: `/^[0-9]{6}$/.test(code)`, not `code.length === 6`, since an application write can be anything.

## Forms and Fields

<!-- prettier-ignore -->
```html
<div ogField #field="ogField">
  <label ogFieldLabel>Κωδικός</label>
  <p ogFieldDescription>Ο 6-ψήφιος κωδικός που στείλαμε</p>
  <div ogOtpField #otp="ogOtpField" class="otp" [class.focused]="otp.state.focused()" [formField]="login.code">
    <input ogOtpFieldInput />
    <div class="cells" aria-hidden="true">…</div>
  </div>
  @if (field.state.errorsShown()) {
    <p ogFieldError>Συμπληρώστε τα 6 ψηφία</p>
  }
</div>
```

```ts
readonly #model = signal({ code: "" });
readonly login = form(this.#model, (path) => {
  required(path.code);
  pattern(path.code, /^[0-9]{6}$/);
});
```

- **Exact validation** is `required` plus `pattern(/^[0-9]{6}$/)`, with the length you set. Edits only ever leave digits, but a value your application writes is kept as written, also one that isn't a code (`12ab`, `1234567`), and the cells show its first six characters, which can look like a valid code. `minLength(6)` alone lets `1234567` through; `pattern` skips the empty code, so `required` covers it. Origami reports no errors of its own.
- **Signal Forms:** put `[formField]` on the root, for a `string` field. It binds the `value` model, writes `disabled` and `readonly` from the field's rules and marks the field touched when focus leaves the Input. `focusBoundControl()` calls the root's `focus()`, which focuses the Input. `reset("")` empties it.
- **Field:** inside an `ogField`, the Input is the Field's control; don't add `ogFieldControl`. A `<label ogFieldLabel>` names it with `for`, so clicking the label focuses it, and its `aria-describedby` names the Descriptions, then the Errors. It carries `aria-invalid` while the Field shows its errors and `aria-required` while the field is required. Say how many digits in a Description: the Input has no `maxlength`.
- **Standalone:** name the Input with `aria-label` or `aria-labelledby`, such as a heading's ID.
- **Readonly and disabled:** a readonly Input is natively `readonly`: it still focuses, and a click still selects a cell, but nothing changes. A disabled one is natively `disabled`, and `focus()` does nothing.

### Your own control

A directive that composes `ogOtpField` through `hostDirectives` and is itself the form control has its own `value` model and `disabled` and `readonly` inputs, provides the OTP field's Options from them, exposes the root's `touch` and forwards `focus()`:

```ts
@Directive({
  selector: "[appPin]",
  hostDirectives: [{ directive: OrigamiOtpField, outputs: ["touch"] }],
  providers: [OrigamiOtpFieldOptions.provideExisting(() => Pin)],
})
export class Pin implements OrigamiOtpFieldOptions, FormValueControl<string> {
  readonly #field = inject(OrigamiOtpField);
  readonly value = model("");
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly length = computed(() => 4);
  readonly mask = computed(() => true);

  focus(options?: FocusOptions): void {
    this.#field.focus(options);
  }
}
```

A component that wraps the field with its own projected Description and Error components puts `OrigamiField` in its `hostDirectives` and composes `OrigamiFieldDescription` or `OrigamiFieldError` in theirs (`{ directive: OrigamiFieldError, inputs: ["id"] }`), without an `[id]` of its own: they join the host's Field, and the Input names them while they're mounted.

## Server rendering and hydration

The server renders the value into the Input's `value` attribute, so a code the application already has shows before any script runs, and hydration keeps it without emitting. Digits typed or pasted into the Input before its block hydrates are kept and committed once when it has hydrated, read as a code like any edit (or undone if they aren't one); Angular's replay of the typing doesn't edit again. A composition from an input method that spans hydration is checked once, when it ends. Leaving the Input before then marks the field touched once it has hydrated. A paste before hydration is the browser's own: a whole code pasted into `12` overflows and is undone, where after hydration it would replace it.

## Not included

No per-cell inputs or cell part; no completion event, auto-submit, resend or timers; no letters, configurable character set or case folding; no overwrite typing mode or selecting cells by dragging; no reveal toggle for a masked PIN; no built-in errors or schema helper; no `maxlength`; no WebOTP (write the code you receive and complete it in your writer); no keypad; no separators or grouped layouts; no right-to-left cell order; no handling of password-manager badges; no hidden input, `name` or native form submission; no `ControlValueAccessor`; no live announcements. The acceptance checks the accessibility tree, not a screen reader, and desktop browsers, not phones: SMS and Mail code suggestions, phone keyboards and touch selection are unverified.
