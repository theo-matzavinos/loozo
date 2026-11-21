import { Component, computed, forwardRef, inject, input } from "@angular/core";
import { OrigamiMonthCalendar } from "@loozo/origami-ui/calendar";
import { cn } from "../cn";
import { CalendarGrid } from "./calendar-grid";
import { CalendarHeader } from "./calendar-header";
import type { CalendarLevel } from "./calendar-labels";
import { CalendarRoot, calendarBoxClasses } from "./calendar-root";

/**
 * A calendar for one month over Origami's MonthCalendar: the displayed year's months, with the
 * heading switching months → years → months. Its value is a `YYYY-MM` string. It renders like
 * Calendar; write nothing inside it.
 *
 * @example
 * ```html
 * <div fold__MonthCalendar [(value)]="billingMonth" maxMonth="2026-12" selectedDescription="selected"></div>
 * ```
 */
@Component({
  selector: "[fold__MonthCalendar]",
  exportAs: "fold__MonthCalendar",
  imports: [CalendarHeader, CalendarGrid],
  hostDirectives: [
    {
      directive: OrigamiMonthCalendar,
      inputs: [
        "value",
        "month",
        "view",
        "minMonth",
        "maxMonth",
        "monthDisabled",
        "locale",
        "today",
        "disabled",
        "readonly",
        "selectedDescription",
      ],
      outputs: ["valueChange", "monthChange", "viewChange", "touch"],
    },
  ],
  providers: [{ provide: CalendarRoot, useExisting: forwardRef(() => MonthCalendar) }],
  host: { "data-slot": "calendar", "[class]": "classes()" },
  template: `<div fold__CalendarHeader></div>
    <table fold__CalendarGrid></table>`,
})
export class MonthCalendar extends CalendarRoot {
  readonly class = input("");

  readonly #calendar = inject(OrigamiMonthCalendar);

  /** Origami's readonly observation: `value`, `month`, `view`, `heading`, `months` and more. */
  readonly state = this.#calendar.state;
  readonly anchor = computed(() => null);
  readonly weeks = computed(() => []);
  readonly weekdays = computed(() => []);
  readonly levels: readonly CalendarLevel[] = ["months", "years"];

  setView(view: CalendarLevel): void {
    // The switch cycles through `levels` only, which has no days view.
    if (view === "days") {
      return;
    }

    this.#calendar.view.set(view);
  }

  /** Signal Forms' `focusBoundControl()` calls this; it focuses the grid's tab stop. */
  focus(options?: FocusOptions): void {
    this.#calendar.focus(options);
  }

  protected readonly classes = computed(() => cn(calendarBoxClasses, this.class()));
}
