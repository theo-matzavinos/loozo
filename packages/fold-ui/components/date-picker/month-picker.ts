import { Directive, computed, forwardRef, inject, input } from "@angular/core";
import { OrigamiMonthPicker } from "@loozo/origami-ui/date-picker";
import { cn } from "../cn";
import { DatePickerRoot } from "./date-picker-root";

/**
 * A month picker over Origami's Month picker: a `YYYY-MM` string or null, chosen from a
 * MonthCalendar in a popup. Button shape only: a DatePickerTrigger showing your text, such as
 * the month through `DatePipe`. Choosing a month closes the popup; choosing a year shows its
 * months.
 *
 * DatePickerContent holds a MonthCalendar, gated on Content's own `state.open()`. Bind the form
 * on the picker, never on the Calendar inside it.
 *
 * @example
 * ```html
 * <div fold__Field>
 *   <span fold__FieldLabel>Billing month</span>
 *   <div fold__MonthPicker [formField]="form.billingMonth" #billing="fold__MonthPicker">
 *     <button fold__DatePickerTrigger>{{ (billing.state.value() | date: "MMMM y") ?? "Choose a month" }}</button>
 *     <div fold__DatePickerContent #content="fold__DatePickerContent">
 *       @if (content.state.open()) {
 *         <div fold__MonthCalendar selectedDescription="selected"></div>
 *       }
 *     </div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[fold__MonthPicker]",
  exportAs: "fold__MonthPicker",
  hostDirectives: [
    {
      directive: OrigamiMonthPicker,
      inputs: ["value", "open", "disabled", "readonly"],
      outputs: ["valueChange", "openChange", "touch"],
    },
  ],
  providers: [{ provide: DatePickerRoot, useExisting: forwardRef(() => MonthPicker) }],
  host: { "data-slot": "date-picker", "[class]": "classes()" },
})
export class MonthPicker extends DatePickerRoot {
  readonly class = input("");

  readonly #picker = inject(OrigamiMonthPicker);

  /** Origami's readonly observation: `value`, `open`, `disabled`, `readonly`. */
  readonly state = this.#picker.state;

  /** Signal Forms' `focusBoundControl()` calls this; it focuses the Trigger. */
  focus(options?: FocusOptions): void {
    this.#picker.focus(options);
  }

  protected readonly classes = computed(() => cn("block min-w-0", this.class()));
}
