import { Directive, computed, inject } from "@angular/core";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { CalendarContext } from "./calendar-context";

/**
 * The composed `ogButton`'s whole Options for a Previous (-1) or Next (+1) button: natively
 * disabled while the root is; disabled but focusable while the step would land wholly outside
 * `minDate`/`maxDate`, so a focused button that reaches the bound keeps focus.
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
 * Shows the month before the displayed one; composes `ogButton`, so it is a native
 * `type="button"`. Focus stays on the button: it doesn't move into the grid, whose tab stop
 * follows the new month. Disabled while the root is disabled (natively) and while the previous
 * month lies wholly before `minDate` (`aria-disabled="true"` and `data-disabled`, still focusable).
 * Readonly Calendars still browse. The consumer supplies its accessible name, such as
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
 * Shows the month after the displayed one, as `ogCalendarPrevious` does the month before:
 * disabled while the root is (natively) and while the next month lies wholly after `maxDate` (still
 * focusable). The consumer supplies its accessible name, such as `aria-label="Next month"`.
 * Requires a nearest Calendar root.
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
