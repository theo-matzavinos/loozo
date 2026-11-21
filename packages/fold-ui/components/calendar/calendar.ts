import { Component, computed, forwardRef, inject, input } from "@angular/core";
import { OrigamiCalendar } from "@loozo/origami-ui/calendar";
import { cn } from "../cn";
import { CalendarGrid } from "./calendar-grid";
import { CalendarHeader } from "./calendar-header";
import type { CalendarLevel } from "./calendar-labels";
import { CalendarRoot, calendarBoxClasses } from "./calendar-root";

/**
 * A calendar for one day over Origami's Calendar: it renders its header, the current view's grid
 * and every cell, so write nothing inside it. The heading is a button that switches the view
 * days → months → years → days. Origami owns the value, keys, focus, bounds and Field wiring.
 * Bind `weekStart` as a number, and set `selectedDescription`, which VoiceOver says on a chosen
 * day.
 *
 * @example
 * ```html
 * <div fold__Field>
 *   <span fold__FieldLabel>Appeal date</span>
 *   <div fold__Calendar [formField]="appeal.date" [weekStart]="1" selectedDescription="selected"></div>
 * </div>
 * ```
 */
@Component({
  selector: "[fold__Calendar]",
  exportAs: "fold__Calendar",
  imports: [CalendarHeader, CalendarGrid],
  hostDirectives: [
    {
      directive: OrigamiCalendar,
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
  providers: [{ provide: CalendarRoot, useExisting: forwardRef(() => Calendar) }],
  host: { "data-slot": "calendar", "[class]": "classes()" },
  template: `<div fold__CalendarHeader></div>
    <table fold__CalendarGrid></table>`,
})
export class Calendar extends CalendarRoot {
  readonly class = input("");

  readonly #calendar = inject(OrigamiCalendar);

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
