# Calendar

Calendar is an inline month grid for choosing a day, several days or a range of days: the grid of the [APG date picker dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/), without the dialog. Its values are ISO day strings, `"2026-10-27"`, never a `Date`, so no time zone can move them. You render the markup from its State; Origami computes the days, labels, keys, focus and ARIA. It's an [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) control, and it joins a [Field](../field/README.md) on its own.

| Directive                              | Configuration                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ogCalendar`                           | `value: string \| null` model (default `null`), `month: string \| null` model (default `null`: follow the value), `minDate`, `maxDate: string \| null` (default `null`), `dateDisabled: (date: string) => boolean` (default none), `weekStart: 1–7 \| null` (default `null`: the locale's), `locale` (default `LOCALE_ID`), `today` (default seeded), `fixedWeeks`, `disabled`, `readonly` (default `false`) |
| `ogCalendarMultiple`                   | as `ogCalendar`, with a `value: readonly string[]` model (default `[]`)                                                                                                                                                                                                                                                                                                                                      |
| `ogCalendarRange`                      | as `ogCalendar`, with a `value: OrigamiDateRange \| null` model (default `null`), where `OrigamiDateRange` is `{ start, end }`                                                                                                                                                                                                                                                                               |
| `ogCalendarGrid`                       | none; usually a `<table>`                                                                                                                                                                                                                                                                                                                                                                                    |
| `ogCalendarCell`                       | `date: string` (required, `YYYY-MM-DD`); usually a `<td>`                                                                                                                                                                                                                                                                                                                                                    |
| `ogCalendarHeading`                    | `id` (default generated)                                                                                                                                                                                                                                                                                                                                                                                     |
| `ogCalendarPrevious`, `ogCalendarNext` | none; must be a `<button>`                                                                                                                                                                                                                                                                                                                                                                                   |

```html
<div ogCalendar [(value)]="day" #cal="ogCalendar">
  <header>
    <button ogCalendarPrevious aria-label="Previous month">‹</button>
    <h2 ogCalendarHeading>{{ cal.state.heading() }}</h2>
    <button ogCalendarNext aria-label="Next month">›</button>
  </header>
  <table ogCalendarGrid>
    <thead>
      <tr>
        @for (weekday of cal.state.weekdays(); track $index) {
        <th scope="col" [attr.abbr]="weekday.long">{{ weekday.short }}</th>
        }
      </tr>
    </thead>
    <tbody>
      @for (week of cal.state.weeks(); track $index) {
      <tr>
        @for (day of week; track day.date) {
        <td ogCalendarCell [date]="day.date">{{ day.label }}</td>
        }
      </tr>
      }
    </tbody>
  </table>
</div>
```

Write `<thead>` and `<tbody>` yourself, so the browser inserts nothing that server rendering didn't. Track days by `day.date`. To leave the neighbouring months' days blank, keep their `<td>` and skip `ogCalendarCell` on it (`day.outside` tells you which they are).

`ogCalendarMultiple` and `ogCalendarRange` take the same parts and markup; only the root and its `exportAs` change.

## Several days

```html
<div ogCalendarMultiple [(value)]="days" #cal="ogCalendarMultiple">
  <!-- header and grid as above -->
</div>
```

Choosing a day toggles it: a chosen day is removed, another added. Each choice writes the days in chronological order, each once, including days in months the Calendar isn't showing, then any entries that aren't days, such as `"27/10/2026"`, which select nothing, in their own order. Your own writes are kept as written, unsorted too, until the next choice sorts them. While `month` is `null`, the Calendar shows the month of the value's first day.

The grid is `aria-multiselectable="true"`, and every day has `aria-selected`, `"true"` or `"false"`.

## A range

```html
<div ogCalendarRange [formField]="filters.period" #period="ogCalendarRange">
  <!-- header and grid -->
</div>
<p>{{ period.state.anchor() ? "Choose the last day" : "Choose the first day" }}</p>
```

`filters.period` is an `OrigamiDateRange | null` field. The first choice sets the anchor, `state.anchor()`, and writes nothing. While it's set, moving the pointer over a day, or focus to it, previews the range: the days from the anchor to that day get `data-preview`. The second choice writes `{ start, end }` in chronological order and clears the anchor; choosing the anchor again makes a one-day range. So the value is never half a range, and a form only ever sees whole ones.

- Escape clears the anchor without writing, also while Previous or Next has focus. Without an anchor, Escape is left alone, so a Calendar in a Dialog or Popover clears the anchor on the first Escape and closes on the next.
- Any write of the value, yours or the form's, clears it, and so does the Calendar becoming readonly or disabled. A readonly Calendar never sets one.
- Leaving the Calendar keeps it, and so do Previous and Next, so a range can span months.
- Only the first and last day must be enabled; disabled days can lie inside a range. If `minDate`, `maxDate` or `dateDisabled` disable the anchor before the second choice, that choice sets a new anchor instead and writes nothing.
- A value whose `start` or `end` isn't a day, or whose `end` is before its `start`, selects nothing and is kept.

While `month` is `null`, the Calendar shows the month of the range's start.

## Dates

Every date is a canonical ISO string: a day `YYYY-MM-DD`, a month `YYYY-MM`, in the Gregorian calendar, years 0001 to 9999. Strings with four-digit years compare chronologically with `<`, so a validator needs no date library:

```ts
validate(path.dateTo, ({ value, valueOf }) =>
  value() && valueOf(path.dateFrom) && value()! < valueOf(path.dateFrom)!
    ? { kind: "order", message: "Must be on or after From" }
    : null,
);
```

Angular's `DatePipe` reads these strings as local days, so `{{ day() | date }}` shows the right day in every time zone. A value that isn't a canonical day, such as `"2026-02-31"` or `"27/10/2026"`, selects nothing and is kept, like a Select value no option has.

## Value and month

- Only a user's choice writes `value`: a click, Enter or Space on a day that can be chosen. Each root has its own rule: `ogCalendar` writes the chosen day, and choosing the chosen day writes nothing; `ogCalendarMultiple` toggles it; `ogCalendarRange` sets the first day, then writes the range (see [Several days](#several-days) and [A range](#a-range)). Your own writes always apply.
- `month` is the displayed month. While it's `null`, the Calendar follows the value: it shows the value's month, else today's, and a value write moves the display. Keyboard moves into another month and Previous/Next write `month`, and so does choosing a day of the neighbouring month unless the display already follows the value there. Choosing a day of the displayed month never moves it: when following would, such as after removing the first of several days, the Calendar writes the displayed month to `month`, so the day keeps focus. Write a `YYYY-MM` yourself to show that month, or `null` to follow again. `state.month()` is always the month actually shown.
- The Calendar shows February 0001 through November 9999, so every week is whole and every day sits under its weekday. A `month` or value before or after them shows the nearest of them; values in January 0001 and December 9999 stay valid.

## Keyboard

Focus moves between the days; the grid has one tab stop. Keys with Alt, Ctrl or Meta, keys already `defaultPrevented` and keys during IME composition are ignored.

| Key                           | Action                                                                     |
| ----------------------------- | -------------------------------------------------------------------------- |
| ArrowLeft / ArrowRight        | the previous / next day (swapped in right-to-left text)                    |
| ArrowUp / ArrowDown           | the same weekday of the previous / next week                               |
| Home / End                    | the first / last day of the week                                           |
| PageUp / PageDown             | the same day of the previous / next month, or its last day if it's shorter |
| Shift+PageUp / Shift+PageDown | the same day of the previous / next year (February 29 becomes 28)          |
| Enter, Space                  | choose the focused day                                                     |
| Escape                        | under `ogCalendarRange`, clear the anchor, also from Previous and Next     |

A move past the displayed month shows the next one, and focus follows to the day once its cell renders. From January 31, PageDown lands on February 28, or 29 in a leap year, and PageDown again on March 28. Moves stop at `minDate` and `maxDate`, and at February 1, 0001 and November 30, 9999. With a `maxDate` before February 1, 0001, or a `minDate` after November 30, 9999, no day is both, so the keys don't move.

The tab stop is the day that last had focus while it's displayed, else the chosen day in the displayed month (several days: the value's first day in it; a range: its start), else today, else the month's first day that can be chosen. Tab into the grid lands on it.

## Pointer and buttons

A click chooses a day and focuses it. Previous and Next show the month before and after; they keep focus, and the grid's tab stop follows the new month. They're disabled, with `aria-disabled="true"` and `data-disabled` but still focusable, while that month lies wholly outside `minDate` and `maxDate`, so a focused button that reaches the bound keeps focus. Give them an accessible name, such as `aria-label="Previous month"`.

A `focus()` that is still waiting for its day's cell to render gives up for good once Previous or Next steps or focus moves to another element, even if focus comes back, so it never takes focus back.

## Bounds and disabled days

- `minDate` and `maxDate` (`YYYY-MM-DD`) disable the days before and after them, stop the keys and disable Previous and Next. They aren't named `min` and `max` because Signal Forms reserves those for its own number and `Date` rules on every `[formField]` control.
- `dateDisabled` disables the days it returns true for, such as weekends.
- A disabled day still takes focus, with `aria-disabled="true"`, so the grid keeps its seven columns for the keys; it can't be chosen. Bounds and `dateDisabled` only stop choosing; validation stays in your form schema.
- `readonly` browses: keys move focus and change months, Previous and Next work, but nothing writes the value.
- `disabled` takes no focus (no cell has a `tabindex`), ignores the pointer and natively disables Previous and Next.

## Locale, today and week start

Labels come from `Intl` for `locale` (default Angular's `LOCALE_ID`), always in the Gregorian calendar. The week starts on the locale's first day, from `Intl.Locale#getWeekInfo()` where the engine has it, else Monday; set `weekStart` (1 is Monday, 7 is Sunday) to choose it yourself. Firefox before 153 has no week data, so a Calendar the browser creates there in a Sunday locale starts on Monday unless you pass `weekStart`.

`today` marks a day with `aria-current="date"` and is the month shown while there's no value. By default it's the platform's clock in its own time zone: the server's when the Calendar hydrates (below), the browser's for a Calendar the browser creates. Pass the user's today to pin their time zone. It isn't refreshed at midnight.

## Forms and Fields

```html
<div ogField #field="ogField">
  <span ogFieldLabel>Appeal date</span>
  <div ogCalendar [formField]="appeal.date" minDate="2026-10-05" #cal="ogCalendar">
    <!-- header and grid as above -->
  </div>
  <p ogFieldDescription>On or after 5 October.</p>
  @if (field.state.errorsShown()) {
  <p ogFieldError>{{ field.state.errors()[0]?.message }}</p>
  }
</div>
```

- **Signal Forms:** put `[formField]` on the root, for a `string | null` field (`ogCalendarMultiple`: `readonly string[]`; `ogCalendarRange`: `OrigamiDateRange | null`). It binds the `value` model, writes `disabled` and `readonly` from the field's rules, and marks the field touched when focus leaves the root. Moving between days, to Previous or Next, or into another month doesn't touch it. Leaving a range Calendar with its anchor set touches the field and keeps the anchor. `focusBoundControl()` calls the root's `focus()`, which focuses the tab-stop day. `minDate` and `maxDate` bind next to `[formField]`.
- **Field:** inside an `ogField`, the grid is the Field's control; don't add `ogFieldControl`. Its `aria-labelledby` names the Field's Labels, then the Heading, so a screen reader hears "Appeal date, October 2026"; its `aria-describedby` names the Descriptions, then the Errors; `aria-invalid` and `aria-required` follow the Field. A Label doesn't name it with `for`, so clicking the Label does nothing, as with a [RadioGroup](../radio-group/README.md).
- **Standalone:** the grid's `aria-labelledby` is your static one, if any, followed by the Heading.

## Replacing Options

Each root, the Cell and the Heading have their own Options, `OrigamiCalendarOptions`, `OrigamiCalendarMultipleOptions`, `OrigamiCalendarRangeOptions`, `OrigamiCalendarCellOptions` and `OrigamiCalendarHeadingOptions`, with the fields in the table above, replaced as a whole with `provideExisting` or `provideFactory`. Other parts read a cell's Options only once it has registered, after Angular set its inputs, so a replacement may use required inputs. A root replacement owns the value, so `[formField]` doesn't bind it. Previous and Next supply their composed [Button](../button/README.md)'s Options themselves. See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

## State and attributes

`OrigamiCalendarState`, the root's `state`, has the following; `OrigamiCalendarMultipleState` and `OrigamiCalendarRangeState` have the same with their own `value()`, and the range's also has `anchor()`, the pending first day or `null`.

- `value()`: the effective value, including `null`, entries and ranges that select nothing.
- `month()`: the month shown, `YYYY-MM`.
- `heading()`: that month in the locale, such as "October 2026"; render it in the Heading.
- `weekdays()`: seven `{ short, long }` labels from the week start, such as `{ short: "Tue", long: "Tuesday" }`.
- `weeks()`: four to six weeks (six with `fixedWeeks`) of seven `OrigamiCalendarDayRecord`s, `{ date, label, outside }`, where `label` is the localized day number and `outside` marks the neighbouring months' days. It's complete without any cell mounted, also on the server.
- `disabled()`: the root's effective disabled policy.

Descendants of the root can inject its State. The Grid, Cells, Heading and buttons have no `state`.

| Element        | Attributes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root           | `data-today` and `data-week-start`, the seed (below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Grid           | `role="grid"`, `aria-labelledby` (the Field's Labels or your static value, then the Heading), `aria-multiselectable="true"` under `ogCalendarMultiple` and `ogCalendarRange`, `aria-disabled` and `aria-readonly` while disabled or readonly; in a Field, `aria-describedby`, `aria-invalid`, `aria-required`                                                                                                                                                                                                                                           |
| Cell           | `role="gridcell"`, `aria-label` (the full date, such as "Tuesday, October 27, 2026"), `tabindex` (`0` on the tab stop, `-1` elsewhere, none while disabled), `aria-selected="true"` and `data-selected` when chosen (`aria-selected="false"` otherwise under `ogCalendarMultiple` and `ogCalendarRange`), `aria-current="date"` and `data-today`, `data-outside`, `aria-disabled="true"` and `data-disabled`; under `ogCalendarRange`, `data-range-start`, `data-range-end`, `data-in-range` (every day of the range, ends included) and `data-preview` |
| Heading        | `id`, `aria-live="polite"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Previous, Next | `type="button"` and the disabled attributes of [Button](../button/README.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Style from the attributes; you don't need to read State for it.

## Accessibility

Each day is one focusable `gridcell` whose `aria-label` is the full date, because screen readers don't reliably announce column headers in a grid; the day number inside is only visible text. The Heading is a polite live region, so moving to another month announces it. You supply the names of Previous and Next, and a `<th scope="col">` with `abbr` for each weekday. How NVDA, JAWS and VoiceOver announce this structure hasn't been checked with a real screen reader yet.

## Server rendering and hydration

Today and the week start change the grid's markup, and the server and the browser can disagree on both: another time zone, midnight, or an engine without `Intl` week data. So the root writes its seed to its host, `data-today` and `data-week-start`. A hydrating root reads them from its server element and keeps them, so the server's month, today and rows survive hydration, eager or incremental, however long after the page it hydrates. A Calendar the browser creates computes both itself. A range's anchor exists only in the browser: a hydrating range Calendar starts without one.

Server HTML has the whole grid: roles, names, the tab stop, the selection (with a range's markers) and today, the Heading's `id` naming the grid and, in a Field, its `aria-labelledby`, `aria-describedby` and `aria-required`. What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

Months and years views, a month-only calendar, a maximum range length or number of days, a date picker with a trigger or popup, a typed date input, time of day, two months side by side, week numbers, presets, a midnight refresh of today, non-Gregorian calendars and Origami validators. No `ControlValueAccessor`.
