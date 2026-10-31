# Date picker

A date picker is a button that opens a [Calendar](../calendar/README.md) in a popup, for a form field such as "Valid from": you choose a day and the popup closes. Its value is an ISO day, `"2026-10-27"`, never a `Date`. Inside the popup you author an ordinary `ogCalendar`, with its own header, grid and configuration; the picker owns its value, disabled and readonly. The popup is a [Popover](../popover/README.md), so it's presented in the native top layer, positioned against the button and dismissed like one. It's an [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) control, and it joins a [Field](../field/README.md) on its own.

| Directive             | Configuration                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ogDatePicker`        | `value: string \| null` model (`YYYY-MM-DD`, default `null`), `open: boolean` model (default `false`), `disabled`, `readonly` (default `false`), `locale` (default `LOCALE_ID`) |
| `ogDatePickerTrigger` | `id` (default generated), `disabled` (default `false`); must be a `<button>`                                                                                                    |
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
- `locale` is the composed [date field's](../date-field/README.md); the Calendar has its own `locale`.

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
- **Touch:** `touch`, and so Signal Forms' touched state, follows leaving: it's emitted when focus moves outside the picker, and when focus falls to nothing, as when you switch windows, which doesn't close it. Opening, moving between the Trigger and the Calendar, a click on the popup's padding (Content has `tabindex="-1"`), the Calendar's own focus moves, Escape and choosing don't touch.

## Forms and Fields

- **Signal Forms:** put `[formField]` on the root. It binds the `value` model, so the field is `string | null`, writes `disabled` and `readonly` from the field's rules and marks the field touched as above. `focusBoundControl()` calls the root's `focus()`, which focuses the Trigger.
- **Field:** inside an `ogField`, the Trigger is the Field's control; don't add `ogFieldControl`. Its `aria-labelledby` names the Field's Labels, then the Trigger itself, so it reads "Valid from, 27 Oct 2026, button". A Label doesn't name it with `for`, so clicking the Label does nothing. The Trigger's `aria-describedby` names the Field's Descriptions, then its Errors, and `aria-invalid`, `aria-required` and `aria-readonly` follow the Field. The Calendar's grid doesn't join the Field inside a picker, wherever you put Content.
- **Standalone:** without a Field, use `[(value)]` and name the Trigger with its text, an `aria-label`, or an `aria-labelledby`, which the Trigger extends with its own ID.

## State and attributes

`OrigamiDatePickerState`, the root's `state`, has `value()`, `open()` (the requested state), `disabled()`, `readonly()`, and the composed date field's `segments()` and `parseErrors()`. Descendants of the root can inject it. The Trigger has no `state`: read the root's through `#picker="ogDatePicker"`. Content's `state.open()` is its Presence retention, as on Popover Content.

| Element | Attributes                                                                                                                                                                                                                                                                                                                   |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root    | `data-layout`, the composed date field's seed                                                                                                                                                                                                                                                                                |
| Trigger | `type="button"`, `aria-haspopup="dialog"`, `id`, `aria-expanded`, `aria-controls` (mounted Content); the disabled attributes of [Button](../button/README.md); `aria-labelledby` (the Field's Labels or your static one, then the Trigger); in a Field, `aria-describedby`, `aria-invalid`, `aria-required`, `aria-readonly` |
| Content | `role="dialog"`, `tabindex="-1"`, `id`, `popover="manual"`, `inert` while not presented, the [Presence](../presence/README.md) attributes, `--og-anchor-width` and `--og-available-height`; its name (below)                                                                                                                 |

## Accessibility

- Content is a non-modal dialog: no `aria-modal` and no focus trap, so Tab can leave it, which closes the picker.
- Content's name, unless you write an `aria-label` or `aria-labelledby` in its template: the Field's Labels, or outside a Field the Trigger's static `aria-labelledby`; else the Trigger's static `aria-label`; else the Trigger itself, so its text names the dialog. A bound `[attr.aria-label]` on the Trigger isn't copied: name Content yourself then.
- Origami ships no strings: name Previous and Next, and the Trigger outside a Field, yourself.

## Server rendering and hydration

Server HTML has the picker closed: the Trigger's `aria-haspopup`, `aria-expanded="false"`, `aria-controls` and, in a Field, its `aria-labelledby` and Field attributes; Content with `role="dialog"`, `inert` and its name; the root's `data-layout`; and a Calendar written without `@if`, hidden, with its own seed. Hydration keeps the nodes and IDs.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

No typed text field around the button, no several-days, range or month picker, no date and time picker, no modal or full-screen variant, no Alt+ArrowDown, no preset, Clear or Today parts (your own buttons in Content write `value` or `open`), and no built-in strings or date formatting.
