import { Directive, computed, forwardRef, inject, input } from "@angular/core";
import { OrigamiDatePickerRange } from "@loozo/origami-ui/date-picker";
import { cn } from "../cn";
import { DatePickerRoot } from "./date-picker-root";

/**
 * A picker for a range of days over Origami's Date picker range: `{ start, end }` with
 * `YYYY-MM-DD` days, or null, chosen from a CalendarRange in a popup. Button shape only: a
 * DatePickerTrigger showing your text, such as both days through `DatePipe`. The first choice
 * sets a pending first day, the second writes the range and closes the popup; Escape drops a
 * pending first day before it closes.
 *
 * DatePickerContent holds a CalendarRange, gated on Content's own `state.open()`. Bind the form
 * on the picker, never on the Calendar inside it.
 *
 * @example
 * ```html
 * <div fold__Field>
 *   <span fold__FieldLabel>Stay</span>
 *   <div fold__DatePickerRange [formField]="form.stay" #stay="fold__DatePickerRange">
 *     <button fold__DatePickerTrigger>
 *       @if (stay.state.value(); as range) {
 *         {{ range.start | date: "d MMM y" }} – {{ range.end | date: "d MMM y" }}
 *       } @else {
 *         Choose dates
 *       }
 *     </button>
 *     <div fold__DatePickerContent #content="fold__DatePickerContent">
 *       @if (content.state.open()) {
 *         <div fold__CalendarRange [weekStart]="1" selectedDescription="selected"></div>
 *       }
 *     </div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[fold__DatePickerRange]",
  exportAs: "fold__DatePickerRange",
  hostDirectives: [
    {
      directive: OrigamiDatePickerRange,
      inputs: ["value", "open", "disabled", "readonly"],
      outputs: ["valueChange", "openChange", "touch"],
    },
  ],
  providers: [{ provide: DatePickerRoot, useExisting: forwardRef(() => DatePickerRange) }],
  host: { "data-slot": "date-picker", "[class]": "classes()" },
})
export class DatePickerRange extends DatePickerRoot {
  readonly class = input("");

  readonly #picker = inject(OrigamiDatePickerRange);

  /** Origami's readonly observation: `value`, `open`, `disabled`, `readonly`. */
  readonly state = this.#picker.state;

  /** Signal Forms' `focusBoundControl()` calls this; it focuses the Trigger. */
  focus(options?: FocusOptions): void {
    this.#picker.focus(options);
  }

  protected readonly classes = computed(() => cn("block min-w-0", this.class()));
}
