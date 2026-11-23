import { Directive, computed, forwardRef, inject, input } from "@angular/core";
import { OrigamiDateTimePicker } from "@loozo/origami-ui/date-picker";
import { cn } from "../cn";
import { DatePickerRoot } from "./date-picker-root";

/**
 * A date-time picker over Origami's Date-time picker: a civil `YYYY-MM-DDTHH:mm` string (with
 * `:ss` at `precision="second"`) or null, with no time zone. Field shape only: the date and time
 * are typed into a DateFieldInput, and a DatePickerTrigger written inside it opens a Calendar
 * for the date; Origami doesn't support a trigger outside the box. A choice sets the date and
 * keeps the typed time. With the time incomplete, the value waits, Origami reports
 * `dateTimeIncomplete` and focuses the first empty segment.
 *
 * DatePickerContent holds a Calendar, gated on Content's own `state.open()`. Bind the form on
 * the picker, never on the Calendar inside it.
 *
 * @example
 * ```html
 * <div fold__Field>
 *   <span fold__FieldLabel>Starts at</span>
 *   <div fold__DateTimePicker [formField]="form.startsAt">
 *     <div fold__DateFieldInput>
 *       <button fold__DatePickerTrigger aria-label="Choose start date"></button>
 *     </div>
 *     <div fold__DatePickerContent align="end" #content="fold__DatePickerContent">
 *       @if (content.state.open()) {
 *         <div fold__Calendar [weekStart]="1" selectedDescription="selected"></div>
 *       }
 *     </div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[fold__DateTimePicker]",
  exportAs: "fold__DateTimePicker",
  hostDirectives: [
    {
      directive: OrigamiDateTimePicker,
      inputs: ["value", "open", "locale", "precision", "hourCycle", "disabled", "readonly"],
      outputs: ["valueChange", "openChange", "touch"],
    },
  ],
  providers: [{ provide: DatePickerRoot, useExisting: forwardRef(() => DateTimePicker) }],
  host: { "data-slot": "date-picker", "[class]": "classes()" },
})
export class DateTimePicker extends DatePickerRoot {
  readonly class = input("");

  readonly #picker = inject(OrigamiDateTimePicker);

  /**
   * Origami's readonly observation: `value`, `open`, `disabled`, `readonly`, `segments`,
   * `parseErrors`.
   */
  readonly state = this.#picker.state;

  /** Signal Forms' `focusBoundControl()` calls this; it focuses the first segment. */
  focus(options?: FocusOptions): void {
    this.#picker.focus(options);
  }

  /** Discards a half-typed draft and its parse error, and writes null. */
  clear(): void {
    this.#picker.clear();
  }

  protected readonly classes = computed(() => cn("block min-w-0", this.class()));
}
