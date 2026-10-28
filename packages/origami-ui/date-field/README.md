# Date field

A date field is a typed date input made of one editable segment per unit, day, month and year, in the order and with the separators of the locale: `10/27/2026` in `en-US`, `27/10/2026` in `el`. Its value is an ISO string, `"2026-10-27"`, never a `Date`, so no time zone can move it. You render the markup from its State; Origami computes the layout, the unit names, typing, keys, focus and ARIA. It's an [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) control that reports half-typed and impossible dates as parse errors, and it joins a [Field](../field/README.md) on its own. A time field, `ogTimeField`, types a wall-clock time, `"09:30"`, and a date-time field, `ogDateTimeField`, a local date and time, `"2026-10-27T09:30"`, with the same parts: see [Time fields](#time-fields) and [Date-time fields](#date-time-fields).

| Directive            | Configuration                                                                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ogDateField`        | `value: string \| null` model (`YYYY-MM-DD`, default `null`), `locale` (default `LOCALE_ID`), `disabled`, `readonly` (default `false`)                                                                                        |
| `ogTimeField`        | `value: string \| null` model (`HH:mm` or `HH:mm:ss`, default `null`), `precision: "minute" \| "second"` (default `"minute"`), `hourCycle: 12 \| 24 \| null` (default `null`: the locale's), `locale`, `disabled`, `readonly` |
| `ogDateTimeField`    | `value: string \| null` model (`YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss`, default `null`), `precision`, `hourCycle`, `locale`, `disabled`, `readonly`, as `ogTimeField`'s                                                   |
| `ogDateFieldInput`   | none; the segment group, usually a `<div>`; it may share the root's element                                                                                                                                                   |
| `ogDateFieldSegment` | `ogDateFieldSegment: OrigamiDateFieldSegmentType` (required: the unit, such as `"year"` or `"hour"`), `placeholder: string \| null` (default `null`: one `–` per digit); usually a `<span>`                                   |

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

## Time fields

`ogTimeField` holds a time on the wall: `"09:30"`, or `"09:30:15"` with `precision="second"`, from `00:00` to `23:59:59`, with no date and no time zone. It uses the same Input and Segments as the date field and the same State, so the markup is the same loop:

<!-- prettier-ignore -->
```html
<div ogField #field="ogField">
  <span ogFieldLabel>Opens at</span>
  <div ogTimeField ogDateFieldInput [formField]="form.opensAt" #time="ogTimeField">
    @for (part of time.state.segments(); track part.key) {
      @if (part.type === "literal") {
        <span aria-hidden="true">{{ part.text }}</span>
      } @else {
        <span [ogDateFieldSegment]="part.type"></span>
      }
    }
  </div>
  @if (field.state.errors()[0]?.kind === "timeIncomplete") {
    <p ogFieldError>Enter a complete time</p>
  }
</div>
```

- **Hour cycle:** `hourCycle` follows the locale while it's `null`: `en-US` and `el` are 12-hour, `en-GB` is 24-hour. Set `hourCycle="12"` or `hourCycle="24"` to force one. A 24-hour field shows the hour 0 to 23. A 12-hour field shows it 1 to 12 and adds a day period segment (`dayPeriod`) for AM and PM in the locale's words (`AM`/`PM`, `π.μ.`/`μ.μ.`); midnight is 12 AM and noon 12 PM. The value is always 24-hour: `12:00 AM` is `"00:00"`.
- **The day period** is named by the locale ("AM/PM", "π.μ./μ.μ."), and its value text is the period's name. Type the first letter of either period, in either case (`a` or `p`, `π` or `μ`); ArrowUp and ArrowDown toggle it, Home is AM and End PM; Backspace and Delete empty it. Its `inputmode` is `"text"`. Some locales start both periods with the same letter (Korean `오전`/`오후`): there the letter chooses AM, and the arrows reach PM.
- **Precision:** `"minute"` lays out hour and minute and writes `"HH:mm"`; `"second"` adds the second and writes `"HH:mm:ss"`. A value of the other precision shows: `"09:30:15"` in a minute field shows 09:30, `"09:30"` in a second field shows 09:30:00. Neither is rewritten until someone edits: the next edit writes the field's precision, without the second in a minute field.
- **Changing `precision`, `hourCycle` or `locale`** lays the field out again. A change of precision or of the hour cycle, from either input or the locale, shows the value again in the new layout: a half-typed draft goes with its parse error, and a segment keeping focus starts its unit over with the next digit. Nothing is written to the value, so a value of the other precision stays until an edit, and `valueChange` doesn't emit. A change of locale that keeps the hour cycle keeps the draft by unit, as for dates.
- **Half-typed times:** while a segment is empty or holds a waiting `0`, the field keeps its value and reports `{ kind: "timeIncomplete" }`. Every complete time exists, so there's no "invalid" kind. Emptying every segment writes `null`; `clear()`, `reset()` and writes work as for dates.
- **Typing:** a 24-hour hour moves on from 3, a 12-hour hour from 2, minutes and seconds from 6. A 12-hour hour ignores `00`. Pasting a whole time, `13:45` or `13:45:30`, fills every unit, also the day period, and writes the field's precision; digits fill the focused unit.
- **Server rendering:** the seed carries the hour cycle and the day period names too. Node and browsers don't agree on the space before "PM" (U+202F against U+0020), and a hydrated time field keeps the server's.

A composer of `ogTimeField` provides `OrigamiTimeFieldOptions`, the same as the date field's with `precision` and `hourCycle`.

## Date-time fields

`ogDateTimeField` holds a date and a time on the wall: `"2026-10-27T09:30"`, or `"2026-10-27T09:30:15"` with `precision="second"`. The date is a real day in years 0001 to 9999 and the time runs from `00:00` to `23:59:59`. There is no time zone: the field never reads or writes a zone, an offset or `Z`, and never reads the browser's zone (see [Time zones are yours](#time-zones-are-yours)). The markup is the same loop:

<!-- prettier-ignore -->
```html
<div ogField #field="ogField">
  <span ogFieldLabel>Starts at</span>
  <div ogDateTimeField ogDateFieldInput [formField]="form.startsAt" #startsAt="ogDateTimeField">
    @for (part of startsAt.state.segments(); track part.key) {
      @if (part.type === "literal") {
        <span aria-hidden="true">{{ part.text }}</span>
      } @else {
        <span [ogDateFieldSegment]="part.type"></span>
      }
    }
  </div>
  @if (field.state.errorsShown()) {
    @switch (field.state.errors()[0]?.kind) {
      @case ("dateTimeIncomplete") {
        <p ogFieldError>Enter a complete date and time</p>
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

- **Layout:** the locale formats the date and the time together, so it orders the two halves and picks the separator between them: `10/27/2026, 09:30 AM` in `en-US`, `27/10/2026, 09:30 π.μ.` in `el`, `27/10/2026, 09:30` in `en-GB`. Typing the year's fourth digit moves on to the hour, and ArrowLeft, ArrowRight and Tab cross between the halves like any other segments.
- **Hour cycle, day period and precision** work as for [time fields](#time-fields). A value of the other precision shows, and the next edit, a date edit included, writes the field's precision.
- **Half-typed and impossible values:** while a segment is empty, the time's or the date's, the field keeps its value and reports `{ kind: "dateTimeIncomplete" }`. A complete draft whose date doesn't exist (`02/31/2026, 09:30 AM`) reports `{ kind: "dateInvalid" }`, shown as typed. Emptying every segment writes `null`; `clear()`, `reset()` and writes work as for dates.
- **Changing `precision` or the hour cycle** shows the value again in the new layout, as for time fields: a half-typed draft goes, its date units included, with its parse error, and nothing is written.
- **Values that aren't canonical** show empty segments and stay until someone edits: `"2026-10-27T09:30Z"`, `"2026-10-27T09:30+03:00"`, `"2026-10-27 09:30"`, `"2026-02-31T09:30"`. Pasting a whole local date-time of either precision fills every unit and writes the field's precision; a pasted string with a zone or an offset, a date alone or a time alone is ignored.

A composer of `ogDateTimeField` provides `OrigamiDateTimeFieldOptions`, the same fields as `OrigamiTimeFieldOptions`.

## Time zones are yours

The field holds a civil date, a wall-clock time or a local date and time: no zone, no instant. If your backend speaks instants, convert at your own boundary, in the zone you choose, with whatever you already use (here `@internationalized/date`; Temporal or date-fns-tz work the same way):

```ts
import { parseAbsolute, parseDate, toCalendarDate } from "@internationalized/date";

const zone = "Europe/Athens"; // or getLocalTimeZone(), or the user's profile zone

// load: backend instant -> the day it is in that zone
form.validFrom().value.set(toCalendarDate(parseAbsolute(dto.validFrom, zone)).toString()); // "2026-10-27"

// submit: the day -> the instant it starts in that zone
const instant = parseDate(form.validFrom().value()!).toDate(zone).toISOString();
```

A date-time field holds the wall time in that zone. Loading takes the instant's wall time there; submitting turns the wall time back into an instant, and your app decides what a wall time that happens twice or never (at a daylight saving change) means:

```ts
import { parseAbsolute, parseDateTime, toCalendarDateTime } from "@internationalized/date";

// load: backend instant -> the wall time in that zone, at the field's minute precision
const local = toCalendarDateTime(parseAbsolute(dto.expiresAt, zone)).toString().slice(0, 16);
form.expiresAt().value.set(local); // "2026-10-27T14:30"

// submit: wall time -> instant; "reject" throws for 02:30 on a spring-forward day and for an
// ambiguous fall-back hour ("earlier", "later" and "compatible" pick one instead)
const instant = parseDateTime(form.expiresAt().value()!).toDate(zone, "reject").toISOString();
```

`toString()` writes seconds, so slice to 19 characters for `precision="second"`. A wall time that doesn't exist in the zone is still a valid field value; reject it in the schema with a `validate()` rule that makes the same conversion, if you need to.

## Replacing Options

The roots and the segment have their own Options, `OrigamiDateFieldOptions`, `OrigamiTimeFieldOptions`, `OrigamiDateTimeFieldOptions` and `OrigamiDateFieldSegmentOptions`, with the fields in the table above, replaced as a whole with `provideExisting` or `provideFactory`. The value may be a plain `signal()`, a `linkedSignal()` or a composer's `model()`. See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

## State and attributes

`OrigamiDateFieldState`, the `state` of every root, has:

- `value()`: the effective value, including `null` and a value that isn't a canonical date.
- `segments()`: the layout, `OrigamiDateFieldPart`s `{ key, type, text }`: each unit (`key` and `type` `"month"`, `"day"`, `"year"`, or `"hour"`, `"minute"`, `"second"`, `"dayPeriod"`) with its current text, and each literal (`key` `"literal-0"`, `"literal-1"`, …, `type` `"literal"`) with its text.
- `parseErrors()`: `dateIncomplete`, `dateInvalid`, `timeIncomplete`, `dateTimeIncomplete` or none.
- `disabled()` and `readonly()`: the effective policies.

Descendants of the root can inject its State. The Input and the segments have no `state`.

| Element | Attributes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root    | `data-layout`, the layout seed (below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Input   | `role="group"`; in a Field, `aria-labelledby` and `aria-describedby`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Segment | `role="spinbutton"`, an `id`, `aria-label` (the unit's localized name), `aria-labelledby` (the group's labels, then itself), `aria-valuenow`, `aria-valuemin`, `aria-valuemax` (none while empty), the month's and day period's `aria-valuetext` (its name), `inputmode="numeric"` (the day period's `"text"`), `enterkeyhint="next"`, `spellcheck="false"`, `autocorrect="off"`, `contenteditable` while editable, `tabindex="0"` unless disabled, `aria-readonly`, `aria-disabled`, `aria-invalid`, `aria-required`, `data-placeholder` while empty |

Style the segments' caret, focus ring and placeholder yourself, such as `[ogDateFieldSegment]:focus { caret-color: transparent; }`.

## Accessibility

The group is named by its label and each segment by its unit, announced with its value and bounds; the month and the day period also by their names. The literals are hidden. How NVDA, JAWS, VoiceOver and TalkBack announce this structure, and how iOS and Android keyboards type into it, hasn't been checked with real assistive technology or devices yet; the acceptance checks the accessibility tree and simulated input in Chromium, Firefox and WebKit. Two things it shows: Chromium reports an empty segment's value as `0`, and it doesn't surface the month's `aria-valuetext` in its tree.

## Server rendering and hydration

The order of the segments, their separators, their names and their digits come from `Intl`, and the server's and the browser's can differ. So the root writes its layout to its host as `data-layout`. A hydrating root reads it from its server element and keeps it until `locale` changes, or a time or date-time field's `precision` or hour cycle, so the server's markup survives hydration, eager or incremental, whatever the browser's `Intl` says; it also keeps the server's unit names. A date field the browser creates lays out from its own `Intl`, as does one whose `data-layout` isn't a layout for its units, such as a tampered one. A digit typed into a segment before its `@defer` block hydrates is replayed into it once the block does.

Server HTML has the whole field: the group's role and, in a Field, its labels and description, and every segment's role, ID, names, values and text. What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

Month fields, zoned date-times and instants, a date picker with a trigger or popup, bounds on the field, Origami validators and messages, localized free-text paste, two-digit years, PageUp and PageDown, eras and non-Gregorian calendars, partial dates, a hidden native input for form submission or autofill. No `ControlValueAccessor`.
