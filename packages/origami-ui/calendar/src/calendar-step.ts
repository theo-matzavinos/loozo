import { Directive, computed, inject } from "@angular/core";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { CalendarContext } from "./calendar-context";

/**
 * The composed `ogButton`'s whole Options for a Previous (-1) or Next (+1) button: natively
 * disabled while the root is; disabled but focusable while the step would land wholly outside the
 * bounds, so a focused button that reaches the bound keeps focus.
 */
function provideStepButton(direction: -1 | 1) {
  return OrigamiButtonOptions.provideFactory(() => {
    const context = inject(CalendarContext);

    return {
      disabled: computed(() => context.disabled() || !context.canStep(direction)),
      focusableWhenDisabled: computed(() => !context.disabled()),
    };
  });
}

/**
 * Shows the period before the displayed one, by view: the month before (days), the year before
 * (months) or the twelve years before (years); composes `ogButton`, so it is a native
 * `type="button"`. Focus stays on the button: it doesn't move into the grid, whose tab stop
 * follows the new period. Disabled while the root is disabled (natively) and while the previous
 * period lies wholly before `minDate` (`ogMonthCalendar`: `minMonth`) or before the first period
 * the view can show (`aria-disabled="true"` and `data-disabled`, still focusable). Readonly
 * Calendars still browse. The consumer supplies its accessible name, following the view, such as
 * `aria-label="Previous month"`. Requires a nearest Calendar root.
 */
@Directive({
  selector: "button[ogCalendarPrevious]",
  hostDirectives: [OrigamiButton],
  providers: [provideStepButton(-1)],
  host: { "(click)": "clicked()" },
})
export class OrigamiCalendarPrevious {
  readonly #context = inject(CalendarContext);

  /** @internal A disabled button's click does nothing. */
  protected clicked(): void {
    this.#context.step(-1);
  }
}

/**
 * Shows the period after the displayed one, by view (a month, a year or twelve years), as
 * `ogCalendarPrevious` does the period before: disabled while the root is (natively) and while
 * the next period lies wholly after `maxDate` (`ogMonthCalendar`: `maxMonth`) or after the last
 * the view can show (still focusable). The consumer supplies its accessible name, following the
 * view, such as `aria-label="Next month"`. Requires a nearest Calendar root.
 */
@Directive({
  selector: "button[ogCalendarNext]",
  hostDirectives: [OrigamiButton],
  providers: [provideStepButton(1)],
  host: { "(click)": "clicked()" },
})
export class OrigamiCalendarNext {
  readonly #context = inject(CalendarContext);

  /** @internal A disabled button's click does nothing. */
  protected clicked(): void {
    this.#context.step(1);
  }
}
