# OTP field design map

Ownership and read timing. Usage is in the [README](README.md); the contract is SPEC section 32.

```text
OrigamiOtpField (root, a wrapper element)   Options: value, length, mask, disabled, readonly
 │  OtpFieldContext: code rules (otp-code.ts), edits, Input registration, the mirrored selection
 │                   and focus, touches, the root's first-render queue of departures
 │  OrigamiOtpFieldState: value, complete, cells, focused, mask, disabled, readonly
 │  outputs: valueChange (the model's), touch; method focus()        — no completion event
 └─ Input (input[ogOtpFieldInput]) ──register(ngOnInit)──▶ Context (one; a second throws)
      │                              Field membership (labelable) + shared description
      ├ attr value = value; type = mask ? password : text
      ├ beforeinput (typed insertText, cancelable) ──predict: normalize + accept?──▶ native
      │                                ├─ rejected ──▶ preventDefault (no input)
      │                                └─ other form ──▶ preventDefault + execCommand(digits)
      ├ input/composition end ──normalize + accept?──▶ Context.edit(code) ──▶ value.set
      │                                └─ else undo (value + selection before the edit)
      ├ paste ──normalize──▶ execCommand insertText (whole code: select all first) ──▶ input
      ├ focus/select/selectionchange/blur ──▶ Context.mirror(selection, focused) ──▶ State.cells
      ├ pointerdown: position · mousedown (primary, single): collapse a range
      ├ click (primary, single, unmoved) ──equal slot──▶ select [i, i+1] or caret at end
      ├ dblclick ──▶ select()
      └ after every render: element ≠ value (not composing) ──▶ element.value; first render of
        a hydrating Input: take the element's text as an edit, or undo it
```

## Ownership

| Fact                                                | Owner                                                                                                                                                                                                              | Readers                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Options (value, length, mask, policies)             | the root directive through `OrigamiOtpFieldOptions` (`provideExisting`), or a composer's replacement                                                                                                               | the Context (deferred with `injectDeferred`)                                         |
| The code rules                                      | `otp-code.ts`: `normalizeCode`, `acceptsCode`, `isComplete`, pure                                                                                                                                                  | the Context (`accepts`, `complete`), the Input (edits, paste)                        |
| The value                                           | the effective `value` signal: written by the Context's `edit` (an accepted edit whose code differs) and by the application                                                                                         | State `value`, `complete`, `cells`; the Input's `value` attribute and property sync  |
| The mounted Input (element)                         | the Context: set by the Input's `ngOnInit`, cleared by its `DestroyRef` (with the mirror); a second registration throws                                                                                            | `focus()`                                                                            |
| Selection and focus mirror                          | the Context's `selection` and `focused` signals, written only by the Input: at `focus`, `select`, `blur`, a document `selectionchange` while it is the active element, after its own writes and after every render | State `cells` and `focused`                                                          |
| Root rendered (browser)                             | the Context: false until its `afterNextRender` (read phase); departures that arrive earlier are counted and touch then, until the root is destroyed                                                                | `left`                                                                               |
| Input rendered (hydration)                          | the Input: false from construction while its element carries a `value` attribute in the browser (a hydrating Input), true after its `afterNextRender`                                                              | its `input` and `compositionend` checks and its after-render sync                    |
| Composition open                                    | the Input: set by a genuine `compositionstart`, and by a hydrating Input's first render when the events Angular holds for replay leave one open; cleared by a genuine `compositionend`                             | its first render (no adoption while open), `beforeinput`, `input`, after-render sync |
| Selection before an edit                            | the Input: recorded at `beforeinput` (not composing) and `compositionstart`, cleared when that `beforeinput` cancels, consumed by the next check                                                                   | the undo                                                                             |
| The Input's own insertion                           | the Input: set around its `execCommand("insertText")` (paste, a typed insertion in another form)                                                                                                                   | its `beforeinput`: that insertion stays native                                       |
| The text a composition's end was checked with       | the Input: set at `compositionend`, cleared by the next `input`, `beforeinput` or `compositionstart`                                                                                                               | its `input` handler: Firefox's trailing `input` isn't a new edit                     |
| The last accepted edit's code, the last value shown | the Input: set by an accepted check, and by each after-render sync                                                                                                                                                 | the sync: a value that changed without an edit moves a focused caret to the end      |
| The last primary press position                     | the Input: set by `pointerdown`, consumed by the next `click`                                                                                                                                                      | the click mapping and its 4 px movement guard                                        |
| Field membership and form state                     | the Field (`ɵOrigamiFieldMembership`, labelable) with the root's `FORM_FIELD` as form state                                                                                                                        | the Input's `aria-invalid`, `aria-required`, `aria-describedby`; the Label's `for`   |

## Read timing

| Read                     | Reader                                      | Phase                    | Platform | If the owner isn't initialized                                                                                                    |
| ------------------------ | ------------------------------------------- | ------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Root Options             | the Context's `computed`s                   | render, event            | both     | Deferred: resolved on the first read, after the root's construction, so its inputs are set. A replacement must be complete.       |
| The mounted Input        | `focus()`                                   | event                    | browser  | Without one, `focus()` does nothing (no pre-mount request).                                                                       |
| `selection`, `focused`   | State `cells`, `focused`                    | render                   | both     | Null and false until the Input's first focus or render sync; never set on the server, so server cells have no caret or selection. |
| `value` attribute        | the Input's constructor                     | construction             | browser  | Present only on a hydrating Input's server element (Angular writes the `[attr.value]` binding after construction).                |
| Element text             | the Input's first `afterNextRender`         | after render             | browser  | A hydrating Input's server text or pre-hydration typing; equal to the value, nothing happens.                                     |
| Element text, selection  | the Input's `beforeinput`                   | event                    | browser  | Read live from the element; before a hydrating Input's first render it is the browser's text, which that render checks.           |
| Element text vs value    | the Input's `afterEveryRender` sync         | after render             | browser  | Skipped before a hydrating Input's adoption and while composing; equal text writes nothing.                                       |
| Queued departures        | the Context's `afterNextRender`             | after render, read phase | browser  | Runs after every view's default-phase callbacks, so a hydrating Input has taken its text first.                                   |
| `pointerdown` position   | the Input's `click`                         | event                    | browser  | No recorded press (a synthetic click, a Label's click, a keyboard click): no mapping.                                             |
| Element selection        | the Input's `mousedown`, `click`            | event                    | browser  | Read live from the element.                                                                                                       |
| `FORM_FIELD` on the root | the Context's `formState()`, the membership | render                   | both     | Self, optional: null without `[formField]`.                                                                                       |

## Refresh dependencies

- An accepted edit writes the code to the element (when normalization changed it) and to the value, which emits a directive model's `valueChange` synchronously, inside the edit. The next render updates the `value` attribute and State; the sync then finds the element equal to the value and writes nothing. `valueChange` has no render dependency.
- An application write changes the value; the render after it writes the `value` property where it differs (the attribute stops showing once the user has edited) and moves a focused Input's caret to the end, also when the attribute already showed it (Chromium leaves the caret at the start there).
- Hydration: the Input's first `afterNextRender` runs after the render that sets the root's `[formField]` binding; it takes the element's text as one edit (one `valueChange`) or undoes it, unless the replay queues leave a composition open, whose genuine end checks it. Replayed `beforeinput`, `input`, composition, `paste`, `mousedown`, `click` and `dblclick` events do nothing. A replayed `blur` waits in the Context's queue: Signal Forms' `touch` listener fails before the root's first render (NG0950).
