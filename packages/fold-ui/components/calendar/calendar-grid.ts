import { Component, inject } from "@angular/core";
import { OrigamiCalendarCell, OrigamiCalendarGrid } from "@loozo/origami-ui/calendar";
import { CalendarRoot } from "./calendar-root";

/**
 * Every cell: the focusable `td` is the hit area and carries the ring, with no base
 * `outline-none`, so forced colors keep the engine's ring. Its chip is inset at least 2px, so no
 * chip reaches the ring's pixels. The focused cell is raised: in forced colors, a neighbour chip's
 * rail would otherwise paint over the ring where it crosses it (Firefox). States reach the chip
 * through `*:`, so nothing leaks into a nested Calendar.
 */
const cellClasses = [
  "p-0 text-center align-middle",
  "focus-visible:relative focus-visible:z-1 focus-visible:outline-2 focus-visible:outline-ring",
  "data-disabled:cursor-not-allowed data-disabled:*:line-through data-disabled:*:opacity-50",
  // Hover tints only what a click can choose.
  "not-forced-colors:[table:not([aria-readonly=true]):not([aria-disabled=true])>tbody>tr>&]:not-data-disabled:not-aria-selected:not-data-anchor:hover:*:bg-foreground/8",
  // Today: a 4px ring dot 2px above the chip's bottom.
  "data-today:*:after:absolute data-today:*:after:bottom-0.5 data-today:*:after:size-1 data-today:*:after:rounded-full data-today:*:after:bg-ring data-today:*:after:content-['']",
  // Chosen: a day, MonthCalendar's month, but not a range's interior.
  "aria-selected:not-data-in-range:*:bg-foreground aria-selected:not-data-in-range:*:font-semibold aria-selected:not-data-in-range:*:text-background aria-selected:not-data-in-range:*:after:bg-background",
  // Only the chip opts out of forced colors; every state it styles names a system color.
  "forced-colors:*:text-[CanvasText] forced-colors:data-today:*:after:bg-[CanvasText]",
  "forced-colors:data-disabled:*:text-[GrayText] forced-colors:data-disabled:*:opacity-100",
  "forced-colors:aria-selected:not-data-in-range:*:bg-[Highlight] forced-colors:aria-selected:not-data-in-range:*:text-[HighlightText] forced-colors:aria-selected:not-data-in-range:*:after:bg-[HighlightText]",
];

/**
 * A 32px day cell: the ring on the cell's edge, 2px outside its 28px chip. A range's band is the
 * cells' own background, so it stays continuous; while a first day is pending (the grid's
 * `data-pending`), the committed range steps back and the preview shows as square cells. In forced
 * colors the band is forced away, so the chip's `::before` draws a `Highlight` rail instead.
 */
const dayClasses = [
  ...cellClasses,
  "size-8 focus-visible:outline-offset-0",
  // Outside days are muted unless filled: unchosen ones, and a range's unfilled interior (Origami
  // marks the whole range aria-selected). In forced colors they keep the base CanvasText, like any
  // choosable day, and disabled and filled ones keep GrayText and HighlightText.
  "not-forced-colors:data-outside:not-aria-selected:not-data-anchor:*:text-muted-foreground",
  "not-forced-colors:data-outside:data-in-range:not-data-range-start:not-data-range-end:not-data-anchor:*:text-muted-foreground",
  // A range's ends and the pending first day fill like a chosen day.
  "data-range-start:*:bg-foreground data-range-start:*:font-semibold data-range-start:*:text-background data-range-start:*:after:bg-background",
  "data-range-end:*:bg-foreground data-range-end:*:font-semibold data-range-end:*:text-background data-range-end:*:after:bg-background",
  "data-anchor:*:bg-foreground data-anchor:*:font-semibold data-anchor:*:text-background data-anchor:*:after:bg-background",
  "forced-colors:data-range-start:*:bg-[Highlight] forced-colors:data-range-start:*:text-[HighlightText] forced-colors:data-range-start:*:after:bg-[HighlightText]",
  "forced-colors:data-range-end:*:bg-[Highlight] forced-colors:data-range-end:*:text-[HighlightText] forced-colors:data-range-end:*:after:bg-[HighlightText]",
  "forced-colors:data-anchor:*:bg-[Highlight] forced-colors:data-anchor:*:text-[HighlightText] forced-colors:data-anchor:*:after:bg-[HighlightText]",
  // The band, and the committed range's rounding: 8px at its ends and a row's first and last cell,
  // only while nothing is pending.
  "data-in-range:bg-foreground/8 data-preview:bg-foreground/8",
  "[table:not([data-pending])>tbody>tr>&]:data-range-start:rounded-s-control-sm [table:not([data-pending])>tbody>tr>&]:data-range-end:rounded-e-control-sm",
  "[table:not([data-pending])>tbody>tr>&]:data-in-range:first:rounded-s-control-sm [table:not([data-pending])>tbody>tr>&]:data-in-range:last:rounded-e-control-sm",
  // Pending: the committed band and end fills step back; the preview keeps its band.
  "[table[data-pending]>tbody>tr>&]:data-in-range:bg-transparent [table[data-pending]>tbody>tr>&]:data-preview:bg-foreground/8",
  "[table[data-pending]>tbody>tr>&]:data-range-start:not-data-anchor:*:bg-transparent [table[data-pending]>tbody>tr>&]:data-range-start:not-data-anchor:*:font-normal [table[data-pending]>tbody>tr>&]:data-range-start:not-data-anchor:*:text-foreground [table[data-pending]>tbody>tr>&]:data-range-start:not-data-anchor:*:after:bg-ring",
  "[table[data-pending]>tbody>tr>&]:data-range-end:not-data-anchor:*:bg-transparent [table[data-pending]>tbody>tr>&]:data-range-end:not-data-anchor:*:font-normal [table[data-pending]>tbody>tr>&]:data-range-end:not-data-anchor:*:text-foreground [table[data-pending]>tbody>tr>&]:data-range-end:not-data-anchor:*:after:bg-ring",
  "forced-colors:[table[data-pending]>tbody>tr>&]:data-range-start:not-data-anchor:*:bg-transparent forced-colors:[table[data-pending]>tbody>tr>&]:data-range-start:not-data-anchor:*:text-[CanvasText] forced-colors:[table[data-pending]>tbody>tr>&]:data-range-start:not-data-anchor:*:after:bg-[CanvasText]",
  "forced-colors:[table[data-pending]>tbody>tr>&]:data-range-end:not-data-anchor:*:bg-transparent forced-colors:[table[data-pending]>tbody>tr>&]:data-range-end:not-data-anchor:*:text-[CanvasText] forced-colors:[table[data-pending]>tbody>tr>&]:data-range-end:not-data-anchor:*:after:bg-[CanvasText]",
  // The forced rail: two 1px lines level with the chip's edges, reaching 2px past it on both sides
  // so neighbours meet; capped at a committed range's ends, never while pending.
  "forced-colors:data-in-range:*:before:absolute forced-colors:data-in-range:*:before:-inset-x-0.5 forced-colors:data-in-range:*:before:inset-y-0 forced-colors:data-in-range:*:before:border-y forced-colors:data-in-range:*:before:border-[Highlight] forced-colors:data-in-range:*:before:content-['']",
  "forced-colors:data-preview:*:before:absolute forced-colors:data-preview:*:before:-inset-x-0.5 forced-colors:data-preview:*:before:inset-y-0 forced-colors:data-preview:*:before:border-y forced-colors:data-preview:*:before:border-[Highlight] forced-colors:data-preview:*:before:content-['']",
  "forced-colors:[table:not([data-pending])>tbody>tr>&]:data-range-start:*:before:start-0 forced-colors:[table:not([data-pending])>tbody>tr>&]:data-range-end:*:before:end-0",
  "forced-colors:[table[data-pending]>tbody>tr>&]:data-in-range:*:before:content-none forced-colors:[table[data-pending]>tbody>tr>&]:data-preview:*:before:content-['']",
];

/**
 * A 48px month or year cell: the ring 2px outside its 36px chip, which is inset 6px. The period
 * holding a day root's value is tinted, the displayed one outlined; in forced colors they become a
 * 2px inset `Highlight` ring and a 1px `CanvasText` border, so a chip that is both shows both.
 */
const periodClasses = [
  ...cellClasses,
  "h-12 focus-visible:-outline-offset-4",
  "data-current:*:border data-current:*:border-input forced-colors:data-current:*:border-[CanvasText]",
  "data-selected:not-aria-selected:*:bg-foreground/8 data-selected:not-aria-selected:*:font-semibold",
  "forced-colors:data-selected:not-aria-selected:*:bg-transparent forced-colors:data-selected:not-aria-selected:*:shadow-[inset_0_0_0_2px_Highlight]",
];

const chipClasses = [
  "relative flex items-center justify-center rounded-option text-body tabular-nums forced-color-adjust-none",
  "transition-colors duration-120 ease-out motion-reduce:transition-none",
];

/**
 * A Calendar's grid, rendered by every root: the current view's table, written as Origami's README
 * asks, with fold's `data-anchor` on the pending first day and `data-pending` on the grid while it
 * is pending. Both are `""` or absent, never `"false"`.
 */
@Component({
  selector: "table[fold__CalendarGrid]",
  imports: [OrigamiCalendarCell],
  hostDirectives: [OrigamiCalendarGrid],
  host: {
    "data-slot": "calendar-grid",
    "[attr.data-pending]": "root.anchor() !== null ? '' : null",
    class: "w-56 table-fixed border-separate border-spacing-0",
  },
  template: `
    @if (root.state.view() === "days") {
      <thead>
        <tr>
          @for (weekday of root.weekdays(); track $index) {
            <th
              data-slot="calendar-weekday"
              scope="col"
              [attr.abbr]="weekday.long"
              class="h-7 p-0 text-label text-muted-foreground"
            >
              {{ weekday.short }}
            </th>
          }
        </tr>
      </thead>
      <tbody>
        @for (week of root.weeks(); track $index) {
          <tr>
            @for (day of week; track day.date) {
              <td
                ogCalendarCell
                [date]="day.date"
                [attr.data-anchor]="root.anchor() === day.date ? '' : null"
                data-slot="calendar-cell"
                [class]="dayClasses"
              >
                <span data-slot="calendar-cell-label" [class]="dayChipClasses">{{
                  day.label
                }}</span>
              </td>
            }
          </tr>
        }
      </tbody>
    } @else {
      <tbody>
        @for (row of periods(); track $index) {
          <tr>
            @for (period of row; track period.date) {
              <td
                ogCalendarCell
                [date]="period.date"
                data-slot="calendar-cell"
                [class]="periodClasses"
              >
                <span data-slot="calendar-cell-label" [class]="periodChipClasses">{{
                  period.label
                }}</span>
              </td>
            }
          </tr>
        }
      </tbody>
    }
  `,
})
export class CalendarGrid {
  protected readonly root = inject(CalendarRoot);
  protected readonly dayClasses = dayClasses.join(" ");
  protected readonly periodClasses = periodClasses.join(" ");
  protected readonly dayChipClasses = [...chipClasses, "mx-auto size-7"].join(" ");
  protected readonly periodChipClasses = [...chipClasses, "mx-1.5 h-9 w-[calc(100%-12px)]"].join(
    " ",
  );

  protected periods() {
    if (this.root.state.view() === "months") {
      return this.root.state.months();
    }

    return this.root.state.years();
  }
}
