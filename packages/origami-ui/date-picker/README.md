# Date picker

A date picker is a button that opens a [Calendar](../calendar/README.md) in a popup, for a form field such as "Valid from": you choose a day and the popup closes. Put the button inside a [date field](../date-field/README.md)'s segments instead and you can also type the date ([field shape](#field-shape)). Its value is an ISO day, `"2026-10-27"`, never a `Date`. Inside the popup you author an ordinary `ogCalendar`, with its own header, grid and configuration; the picker owns its value, disabled and readonly. The popup is a [Popover](../popover/README.md), so it's presented in the native top layer, positioned against the button and dismissed like one. It's an [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) control, and it joins a [Field](../field/README.md) on its own.

| Directive             | Configuration                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ogDatePicker`        | `value: string \| null` model (`YYYY-MM-DD`, default `null`), `open: boolean` model (default `false`), `disabled`, `readonly` (default `false`), `locale` (default `LOCALE_ID`) |
| `ogDatePickerTrigger` | `id` (default generated), `disabled` (default `false`); must be a `<button>`, alone or inside an `ogDateFieldInput`                                                             |
| `ogDatePickerContent` | `id` (default generated), `side` (default `block-end`), `align` (default `start`), `gap` (CSS px, default `0`), as on [Popover Content](../popover/README.md)                   |

<!-- prettier-ignore -->
```html
<div ogField>
  <span ogFieldLabel>Valid from</span>
  <div ogDatePicker [formField]="form.validFrom" #picker="ogDatePicker">
    <button ogDatePickerTrigger>
      {{ picker.state.value() ? (picker.state.value() | date) : "Choose a date" }}
    </button>
    <div ogDatePickerContent>
      <div ogCalendar [minDate]="today" #cal="ogCalendar">
        <button ogCalendarPrevious aria-label="Previous month">‹</button>
        <h2 ogCalendarHeading>{{ cal.state.heading() }}</h2>
        <button ogCalendarNext aria-label="Next month">›</button>
        <table ogCalendarGrid>
          <!-- the weekday header and the weeks, exactly as an inline Calendar -->
        </table>
      </div>
    </div>
  </div>
</div>
```

Put the Trigger and Content inside the root, and the Calendar inside Content. The Trigger's text is yours: Origami formats nothing, and `DatePipe` formats an ISO day safely. The Calendar's markup, keys and options are the [Calendar's](../calendar/README.md); only its `value`, `disabled` and `readonly` come from the picker, so a `value` binding on it is ignored. `ogDatePicker` binds an `ogCalendar`; another Calendar root inside its Content is reported through Angular's `ErrorHandler` and stays an inline Calendar of its own.

- The value is yours. Only a choice in the Calendar writes it, and `clear()`, which writes `null`. A value that isn't a canonical day selects nothing and is kept.
- `open` is the requested state of the popup. The Trigger, a choice, Escape, a click outside and leaving the picker write it, and you can write it yourself, such as from a Done button inside Content.
- `disabled` natively disables the Trigger, so it leaves the Tab order and the picker can't open, and disables the Calendar. Becoming disabled closes an open picker; focus that was in the popup falls to the page, since it can't return to the disabled Trigger, without a touch. Your own writes, `open` included, still apply.
- `readonly` lets the picker open and the Calendar browse, but no day can be chosen.
- `locale` is the composed [date field's](../date-field/README.md) segments'; the Calendar has its own `locale`.

## Field shape

Put the date field's segments and the Trigger in an `ogDateFieldInput` inside the root, and you can type the date or choose it:

<!-- prettier-ignore -->
```html
<div ogField>
  <span ogFieldLabel>Date of birth</span>
  <div ogDatePicker [formField]="form.dateOfBirth" #picker="ogDatePicker">
    <div ogDateFieldInput>
      @for (part of picker.state.segments(); track part.key) {
        @if (part.type === "literal") {
          <span aria-hidden="true">{{ part.text }}</span>
        } @else {
          <span [ogDateFieldSegment]="part.type"></span>
        }
      }
      <button ogDatePickerTrigger aria-label="Choose date">📅</button>
    </div>
    <div ogDatePickerContent align="end">
      <div ogCalendar #cal="ogCalendar">…</div>
    </div>
  </div>
</div>
```

The segments are the [date field's](../date-field/README.md), with its keys, typing and parse errors; the picker supplies its `value`, `locale`, `disabled` and `readonly`. The shape follows where the Trigger sits, once, when it is created.

- **Naming:** the Input group is the Field's control and supplies the field's name, "Date of birth". The Trigger isn't a Field member: name it with an `aria-label`, which also names the popup. Any other ARIA you write on it stays as written.
- **Focus:** `focus()` and `focusBoundControl()` focus the first segment. The popup is positioned against the Trigger, so `align="end"` lines it up with the field's end, and focus returns to the Trigger after a choice and Escape, so the next Tab leaves the field.
- **Choosing over a half-typed date:** a choice also discards whatever the segments hold half-typed. With 27 October 2026 committed and its day cleared (`10/––/2026`, a `dateIncomplete` error), choosing 27 October shows `10/27/2026` again with no parse error, though the value didn't change and `valueChange` doesn't emit.
- **Typing while open:** a date the segments commit while the picker is open is the Calendar's at once, and the Calendar shows its month unless you navigated it in this session. Shift+Tab from the popup reaches the Trigger and then the segments, and the picker stays open.
- **A click on a segment while open** closes the picker, with focus on that segment and no touch: the segments are outside the popup and its Trigger.

## Opening and choosing

A click, Enter or Space on the Trigger opens the picker. Each open starts the Calendar afresh: it shows the value's month (today's without a value) in the days view, whatever month, view or day you left it on, so a bound `[(month)]` or `[(view)]` on the Calendar sees those writes. A Calendar gated as below is reset when it mounts. Once the popup is shown, focus moves into the grid: to the selected day, else today, else the first day that can be chosen.

Choosing a day writes it and closes the picker, the day that's already selected too, which closes without a write. Moving from the years or months view down to the days doesn't close it. Focus returns to the Trigger after Angular has rendered the change, so your Trigger text already shows the new date when a screen reader announces it, even inside an `@if` or a child component.

To skip rendering the Calendar while the picker is closed, gate it on Content's retention, not the root's `open`:

<!-- prettier-ignore -->
```html
<div ogDatePickerContent #content="ogDatePickerContent">
  @if (content.state.open()) {
    <div ogCalendar>…</div>
  }
</div>
```

Content keeps the Calendar until focus is back on the Trigger. Gated on `picker.state.open()`, the Calendar leaves with the focused day before the picker sees it close, and focus stays on the page.

## Escape, leaving and touch

- **Escape** goes to the Calendar first, which returns from the months or years view to the days; the next Escape closes the picker with focus on the Trigger. Inside a [Dialog](../dialog/README.md), the Escape after that closes the Dialog: one layer per press.
- **Leaving:** when focus moves to an element outside the picker, by Tab past the Calendar's last control or a click on another field, the picker closes and focus stays where it went. A click outside closes it too.
- **Touch:** `touch`, and so Signal Forms' touched state, follows leaving: it's emitted when focus moves outside the picker, and when focus falls to nothing, as when you switch windows, which doesn't close it. Opening, moving between the segments, the Trigger and the Calendar, a click on the popup's padding (Content has `tabindex="-1"`), the Calendar's own focus moves, Escape and choosing don't touch. The date field's own `touch`, when focus leaves its segments, isn't passed on: the picker's is the one `[formField]` hears.

## Forms and Fields

- **Signal Forms:** put `[formField]` on the root. It binds the `value` model, so the field is `string | null`, writes `disabled` and `readonly` from the field's rules and marks the field touched as above. `focusBoundControl()` calls the root's `focus()`, which focuses the Trigger, or the first segment in the field shape. In the field shape the date field's parse errors, `dateIncomplete` and `dateInvalid`, reach the same field.
- **Field:** inside an `ogField`, the Trigger is the Field's control; don't add `ogFieldControl`. Its `aria-labelledby` names the Field's Labels, then the Trigger itself, so it reads "Valid from, 27 Oct 2026, button". A Label doesn't name it with `for`, so clicking the Label does nothing. The Trigger's `aria-describedby` names the Field's Descriptions, then its Errors, and `aria-invalid`, `aria-required` and `aria-readonly` follow the Field. The Calendar's grid doesn't join the Field inside a picker, wherever you put Content. In the field shape the Input group is the Field's control instead, as for a date field, and the Trigger joins no Field.
- **Standalone:** without a Field, use `[(value)]` and name the Trigger with its text, an `aria-label`, or an `aria-labelledby`, which the Trigger extends with its own ID.

## State and attributes

`OrigamiDatePickerState`, the root's `state`, has `value()`, `open()` (the requested state), `disabled()`, `readonly()`, and the composed date field's `segments()` and `parseErrors()`. Descendants of the root can inject it. The Trigger has no `state`: read the root's through `#picker="ogDatePicker"`. Content's `state.open()` is its Presence retention, as on Popover Content.

| Element | Attributes                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root    | `data-layout`, the composed date field's seed                                                                                                                                                                                                                                                                                                                       |
| Trigger | `type="button"`, `aria-haspopup="dialog"`, `id`, `aria-expanded`, `aria-controls` (mounted Content); the disabled attributes of [Button](../button/README.md); `aria-labelledby` (the Field's Labels or your static one, then the Trigger); in a Field, `aria-describedby`, `aria-invalid`, `aria-required`, `aria-readonly`. In the field shape only your own ARIA |
| Content | `role="dialog"`, `tabindex="-1"`, `id`, `popover="manual"`, `inert` while not presented, the [Presence](../presence/README.md) attributes, `--og-anchor-width` and `--og-available-height`; its name (below)                                                                                                                                                        |

## Accessibility

- Content is a non-modal dialog: no `aria-modal` and no focus trap, so Tab can leave it, which closes the picker.
- Content's name, unless you write an `aria-label` or `aria-labelledby` in its template: the Field's Labels, or outside a Field and in the field shape the Trigger's static `aria-labelledby`; else the Trigger's static `aria-label`, such as the field shape's "Choose date"; else the Trigger itself, so its text names the dialog. A bound `[attr.aria-label]` on the Trigger isn't copied: name Content yourself then.
- Origami ships no strings: name Previous and Next, the Trigger outside a Field and the field shape's Trigger yourself.

## Server rendering and hydration

Server HTML has the picker closed: the Trigger's `aria-haspopup`, `aria-expanded="false"`, `aria-controls` and, in a Field, its `aria-labelledby` and Field attributes, or in the field shape the segments and the Input's Field attributes; Content with `role="dialog"`, `inert` and its name; the root's `data-layout`; and a Calendar written without `@if`, hidden, with its own seed. Hydration keeps the nodes and IDs.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

No typed plain text (the field shape types into the date field's segments), no range or month field shape, no popup anchored to the segments and no focus return to a segment, no several-days, range or month picker, no date and time picker, no modal or full-screen variant, no Alt+ArrowDown, no preset, Clear or Today parts (your own buttons in Content write `value` or `open`), and no built-in strings or date formatting.
