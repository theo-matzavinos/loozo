# Date field

A date field is a typed date input made of one editable segment per unit, day, month and year, in the order and with the separators of the locale: `10/27/2026` in `en-US`, `27/10/2026` in `el`. Its value is an ISO string, `"2026-10-27"`, never a `Date`, so no time zone can move it. You render the markup from its State; Origami computes the layout, the unit names, typing, keys, focus and ARIA. It's an [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) control that reports half-typed and impossible dates as parse errors, and it joins a [Field](../field/README.md) on its own.

| Directive            | Configuration                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ogDateField`        | `value: string \| null` model (`YYYY-MM-DD`, default `null`), `locale` (default `LOCALE_ID`), `disabled`, `readonly` (default `false`)                       |
| `ogDateFieldInput`   | none; the segment group, usually a `<div>`; it may share the root's element                                                                                  |
| `ogDateFieldSegment` | `ogDateFieldSegment: "year" \| "month" \| "day"` (required: the unit), `placeholder: string \| null` (default `null`: one `–` per digit); usually a `<span>` |

<!-- prettier-ignore -->
```html
<div ogDateField [(value)]="birthDate" #date="ogDateField">
  <div ogDateFieldInput aria-label="Date of birth">
    @for (part of date.state.segments(); track part.key) {
      @if (part.type === "literal") {
        <span aria-hidden="true">{{ part.text }}</span>
      } @else {
        <span [ogDateFieldSegment]="part.type"></span>
      }
    }
  </div>
</div>
```

`state.segments()` is the locale's layout: each unit and each literal between them, in order. Render a segment for each unit and each literal as plain `aria-hidden` text, and track the parts by `part.key`. A segment renders its own text, the digits or its placeholder: don't put content in it. While a unit is empty its segment has `data-placeholder`, so you can style it without reading State. When nothing else sits inside the root, `ogDateField` and `ogDateFieldInput` can share one element.

## Typing and keys

Each segment is a `spinbutton` and its own tab stop.

| Key or input             | Effect                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Digits                   | Fill the unit. Focus moves on once no further digit fits: a month from 2, a day from 4, a year after four digits. `1` in a month shows `01` and waits for `0`–`2` |
| `0` first                | Waits for the next digit                                                                                                                                          |
| A digit past the maximum | Starts the unit over: month `1` then `3` is `03`                                                                                                                  |
| ArrowUp, ArrowDown       | Step the unit by one, wrapping within it without changing another unit, and keep focus. Empty: the minimum or maximum; an empty year starts at this year          |
| Home, End                | The unit's minimum and maximum; a day's maximum is its month's length                                                                                             |
| ArrowLeft, ArrowRight    | The previous and next segment in visual order, swapped in right-to-left text; they stop at the ends                                                               |
| Tab, Shift+Tab           | The next and previous segment, then out of the field                                                                                                              |
| Backspace                | Removes the last digit; on an empty unit, moves to the previous segment                                                                                           |
| Delete                   | Empties the unit                                                                                                                                                  |
| Paste                    | A whole date, `2026-10-27`, fills every unit; digits fill the focused one; anything else is ignored                                                               |

Coming back to a filled segment, the first digit replaces it. Digits of any script count: the locale's own (`٢٧`) and full-width IME digits (`２７`). Segments show digits in the locale's numbering system. A composition from an input method is typed once when it ends, and nothing the browser inserts stays in the segment. Keys with Alt, Ctrl or Meta are left alone.

## Half-typed and impossible dates

The field keeps what you type in a draft. A complete, real date is written to `value` at once, and emptying every segment writes `null`. Anything else keeps the last value and reports a parse error:

- `{ kind: "dateIncomplete" }` while a segment is empty, holds a waiting `0`, or the year has fewer than four digits (`10/––/2026`);
- `{ kind: "dateInvalid" }` for a date that doesn't exist (`02/31/2026`), shown as typed, never clamped.

Clearing the day of a loaded date keeps its month and year, and its value. Writing `value` replaces the draft; writing the value it already has changes nothing, so use the form's `reset()` to throw a draft away and keep the value. A value that isn't a canonical date (`"27/10/2026"`, `"2026-02-31"`) shows empty segments and stays until someone edits.

To empty the field, call the root's `clear()`, not `value.set(null)`. It throws the draft away with its half-typed units and parse error, and writes `null` to the value. Writing `null` yourself does nothing while the value is already `null`, so a half-typed `10/––/––––` over an empty field would stay with its `dateIncomplete`. `valueChange` emits only if the value wasn't `null`. Like any write from code, `clear()` works while the field is readonly or disabled. If a segment keeps focus, the next digit starts its unit over.

Without Signal Forms, read the same errors from `state.parseErrors()`. Origami ships no messages; map the kinds to your own.

## Forms and Fields

<!-- prettier-ignore -->
```html
<div ogField #field="ogField">
  <span ogFieldLabel>Date of birth</span>
  <div ogDateField ogDateFieldInput [formField]="form.dateOfBirth" #date="ogDateField">
    @for (part of date.state.segments(); track part.key) {
      @if (part.type === "literal") {
        <span aria-hidden="true">{{ part.text }}</span>
      } @else {
        <span [ogDateFieldSegment]="part.type"></span>
      }
    }
  </div>
  <button type="button" (click)="date.clear()">Clear</button>
  @if (field.state.errorsShown()) {
    @switch (field.state.errors()[0]?.kind) {
      @case ("dateIncomplete") {
        <p ogFieldError>Enter a complete date</p>
      }
      @case ("dateInvalid") {
        <p ogFieldError>This date doesn't exist</p>
      }
      @default {
        <p ogFieldError>{{ field.state.errors()[0]?.message }}</p>
      }
    }
  }
</div>
```

- **Signal Forms:** put `[formField]` on the root, for a `string | null` field. It binds the `value` model, writes `disabled` and `readonly` from the field's rules, and marks the field touched when focus leaves the Input; moving between segments doesn't touch it. The parse errors come first in the field's errors, so `dateIncomplete` and `required` can both be there while a draft sits over an empty value. `focusBoundControl()` calls the root's `focus()`, which focuses the first segment. To empty the field, call `clear()` (see [Half-typed and impossible dates](#half-typed-and-impossible-dates)): the form sees the `null`, and a draft over an already empty value goes too. Don't write `null` to the form's value for this, and keep the form's `reset()` for when you also want to reset touched and dirty. Bounds and other rules belong in the schema:

  ```ts
  validate(path.dateOfBirth, ({ value }) =>
    value() && value()! > today ? { kind: "future", message: "Can't be in the future" } : null,
  );
  ```

- **Field:** inside an `ogField`, the Input is the Field's control; don't add `ogFieldControl`. Its `aria-labelledby` names the Field's Labels and its `aria-describedby` the Descriptions, then the Errors. Each segment's `aria-labelledby` names the same Labels, then the segment, so a screen reader hears "Date of birth day". The segments carry `aria-invalid` while the Field shows its errors and `aria-required` while the field is required. A Label doesn't name the group with `for`, so clicking it does nothing, as with a [RadioGroup](../radio-group/README.md).
- **Standalone:** name the Input with `aria-label` or `aria-labelledby`; a static `aria-labelledby` is named by the segments too.
- **Readonly and disabled:** readonly segments still focus and move, but don't edit. Disabled segments leave the tab order, and `focus()` does nothing.

### Your own control

A directive that composes `ogDateField` through `hostDirectives` and is itself the form control has its own `value` model and `disabled` and `readonly` inputs, provides the date field's Options from them, exposes the root's `touch` and forwards `focus()`, since Signal Forms calls it on the control it binds. The parse errors still reach the form, and the composed root's `clear()` writes `null` through your `value`.

```ts
@Directive({
  selector: "[appDateOfBirth]",
  hostDirectives: [{ directive: OrigamiDateField, outputs: ["touch"] }],
  providers: [OrigamiDateFieldOptions.provideExisting(() => DateOfBirth)],
})
export class DateOfBirth implements OrigamiDateFieldOptions, FormValueControl<string | null> {
  readonly #field = inject(OrigamiDateField);
  readonly value = model<string | null>(null);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly locale = computed(() => "en-GB");

  focus(options?: FocusOptions): void {
    this.#field.focus(options);
  }
}
```

A replacement that owns the value without being the control, such as a `provideFactory` holding a plain `signal()`, works without `[formField]`; `[formField]` binds the model of the control it finds, not your signal.

## Time zones are yours

The field holds a civil date: no zone, no instant. If your backend speaks instants, convert at your own boundary, in the zone you choose, with whatever you already use (here `@internationalized/date`; Temporal or date-fns-tz work the same way):

```ts
import { parseAbsolute, parseDate, toCalendarDate } from "@internationalized/date";

const zone = "Europe/Athens"; // or getLocalTimeZone(), or the user's profile zone

// load: backend instant -> the day it is in that zone
form.validFrom().value.set(toCalendarDate(parseAbsolute(dto.validFrom, zone)).toString()); // "2026-10-27"

// submit: the day -> the instant it starts in that zone
const instant = parseDate(form.validFrom().value()!).toDate(zone).toISOString();
```

## Replacing Options

The root and the segment have their own Options, `OrigamiDateFieldOptions` and `OrigamiDateFieldSegmentOptions`, with the fields in the table above, replaced as a whole with `provideExisting` or `provideFactory`. The value may be a plain `signal()`, a `linkedSignal()` or a composer's `model()`. See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

## State and attributes

`OrigamiDateFieldState`, the root's `state`, has:

- `value()`: the effective value, including `null` and a value that isn't a canonical date.
- `segments()`: the layout, `OrigamiDateFieldPart`s `{ key, type, text }`: each unit (`key` and `type` `"month"`, `"day"`, `"year"`) with its current text, and each literal (`key` `"literal-0"`, `"literal-1"`, …, `type` `"literal"`) with its text.
- `parseErrors()`: `dateIncomplete`, `dateInvalid` or none.
- `disabled()` and `readonly()`: the effective policies.

Descendants of the root can inject its State. The Input and the segments have no `state`.

| Element | Attributes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root    | `data-layout`, the layout seed (below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Input   | `role="group"`; in a Field, `aria-labelledby` and `aria-describedby`                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Segment | `role="spinbutton"`, an `id`, `aria-label` (the unit's localized name), `aria-labelledby` (the group's labels, then itself), `aria-valuenow`, `aria-valuemin`, `aria-valuemax` (none while empty), the month's `aria-valuetext` (its name), `inputmode="numeric"`, `enterkeyhint="next"`, `spellcheck="false"`, `autocorrect="off"`, `contenteditable` while editable, `tabindex="0"` unless disabled, `aria-readonly`, `aria-disabled`, `aria-invalid`, `aria-required`, `data-placeholder` while empty |

Style the segments' caret, focus ring and placeholder yourself, such as `[ogDateFieldSegment]:focus { caret-color: transparent; }`.

## Accessibility

The group is named by its label and each segment by its unit, announced with its value and bounds; the month also by its name. The literals are hidden. How NVDA, JAWS, VoiceOver and TalkBack announce this structure, and how iOS and Android keyboards type into it, hasn't been checked with real assistive technology or devices yet; the acceptance checks the accessibility tree and simulated input in Chromium, Firefox and WebKit. Two things it shows: Chromium reports an empty segment's value as `0`, and it doesn't surface the month's `aria-valuetext` in its tree.

## Server rendering and hydration

The order of the segments, their separators, their names and their digits come from `Intl`, and the server's and the browser's can differ. So the root writes its layout to its host as `data-layout`. A hydrating root reads it from its server element and keeps it until `locale` changes, so the server's markup survives hydration, eager or incremental, whatever the browser's `Intl` says; it also keeps the server's unit names. A date field the browser creates lays out from its own `Intl`, as does one whose `data-layout` isn't a layout for its units, such as a tampered one. A digit typed into a segment before its `@defer` block hydrates is replayed into it once the block does.

Server HTML has the whole field: the group's role and, in a Field, its labels and description, and every segment's role, ID, names, values and text. What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

Time, date-time and month fields, a date picker with a trigger or popup, bounds on the field, Origami validators and messages, localized free-text paste, two-digit years, PageUp and PageDown, eras and non-Gregorian calendars, partial dates, a hidden native input for form submission or autofill. No `ControlValueAccessor`.
