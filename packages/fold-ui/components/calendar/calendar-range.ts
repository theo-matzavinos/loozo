import { Component, computed, forwardRef, inject, input } from "@angular/core";
import { OrigamiCalendarRange } from "@loozo/origami-ui/calendar";
import { cn } from "../cn";
import { CalendarGrid } from "./calendar-grid";
import { CalendarHeader } from "./calendar-header";
import { CALENDAR_LABELS, type CalendarLevel } from "./calendar-labels";
import { CalendarRoot, calendarBoxClasses } from "./calendar-root";

/**
 * A calendar for a range of days over Origami's CalendarRange: the first choice sets a pending
 * first day, the second writes the range. A band joins the range's days between its filled ends;
 * while the first day is pending, the band shows the range the next choice writes instead. Under
 * the grid, a polite prompt asks for the first or the last day. It renders like Calendar; write
 * nothing inside it.
 *
 * @example
 * ```html
 * <div fold__CalendarRange [formField]="filters.period" [weekStart]="1" selectedDescription="selected"></div>
 * ```
 */
@Component({
  selector: "[fold__CalendarRange]",
  exportAs: "fold__CalendarRange",
  imports: [CalendarHeader, CalendarGrid],
  hostDirectives: [
    {
      directive: OrigamiCalendarRange,
      inputs: [
        "value",
        "month",
        "view",
        "minDate",
        "maxDate",
        "dateDisabled",
        "weekStart",
        "locale",
        "today",
        "fixedWeeks",
        "disabled",
        "readonly",
        "selectedDescription",
      ],
      outputs: ["valueChange", "monthChange", "viewChange", "touch"],
    },
  ],
  providers: [{ provide: CalendarRoot, useExisting: forwardRef(() => CalendarRange) }],
  host: { "data-slot": "calendar", "[class]": "classes()" },
  // No anchor can be set while the grid is readonly or disabled, so the prompt hides then.
  template: `
    <div fold__CalendarHeader></div>
    <table fold__CalendarGrid></table>
    <p
      data-slot="calendar-prompt"
      aria-live="polite"
      class="text-label font-normal text-muted-foreground [[aria-disabled=true]~&]:hidden [[aria-readonly=true]~&]:hidden"
    >
      {{ prompt() }}
    </p>
  `,
})
export class CalendarRange extends CalendarRoot {
  readonly class = input("");

  readonly #calendar = inject(OrigamiCalendarRange);

  /** Origami's readonly observation: `value`, `month`, `view`, `heading`, `anchor` and more. */
  readonly state = this.#calendar.state;
  readonly anchor = this.state.anchor;
  readonly weeks = this.state.weeks;
  readonly weekdays = this.state.weekdays;
  readonly levels: readonly CalendarLevel[] = ["days", "months", "years"];

  setView(view: CalendarLevel): void {
    this.#calendar.view.set(view);
  }

  /** Signal Forms' `focusBoundControl()` calls this; it focuses the grid's tab stop. */
  focus(options?: FocusOptions): void {
    this.#calendar.focus(options);
  }

  readonly #labels = inject(CALENDAR_LABELS);

  protected readonly prompt = computed(() => {
    if (this.anchor() === null) {
      return this.#labels.chooseFirstDay;
    }

    return this.#labels.chooseLastDay;
  });

  protected readonly classes = computed(() => cn(calendarBoxClasses, this.class()));
}
