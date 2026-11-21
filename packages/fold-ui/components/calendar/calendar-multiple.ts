import { Component, computed, forwardRef, inject, input } from "@angular/core";
import { OrigamiCalendarMultiple } from "@loozo/origami-ui/calendar";
import { cn } from "../cn";
import { CalendarGrid } from "./calendar-grid";
import { CalendarHeader } from "./calendar-header";
import type { CalendarLevel } from "./calendar-labels";
import { CalendarRoot, calendarBoxClasses } from "./calendar-root";

/**
 * A calendar for several days over Origami's CalendarMultiple: each click or Enter adds or
 * removes a day, and chosen days are separate chips. It renders like Calendar; write nothing
 * inside it.
 *
 * @example
 * ```html
 * <div fold__CalendarMultiple [(value)]="holidays" [weekStart]="1" selectedDescription="selected"></div>
 * ```
 */
@Component({
  selector: "[fold__CalendarMultiple]",
  exportAs: "fold__CalendarMultiple",
  imports: [CalendarHeader, CalendarGrid],
  hostDirectives: [
    {
      directive: OrigamiCalendarMultiple,
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
  providers: [{ provide: CalendarRoot, useExisting: forwardRef(() => CalendarMultiple) }],
  host: { "data-slot": "calendar", "[class]": "classes()" },
  template: `<div fold__CalendarHeader></div>
    <table fold__CalendarGrid></table>`,
})
export class CalendarMultiple extends CalendarRoot {
  readonly class = input("");

  readonly #calendar = inject(OrigamiCalendarMultiple);

  /** Origami's readonly observation: `value`, `month`, `view`, `heading`, `weeks` and more. */
  readonly state = this.#calendar.state;
  readonly anchor = computed(() => null);
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

  protected readonly classes = computed(() => cn(calendarBoxClasses, this.class()));
}
