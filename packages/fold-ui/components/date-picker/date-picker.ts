import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiDatePicker } from "@loozo/origami-ui/date-picker";
import { cn } from "../cn";

/**
 * A single date picker over Origami's Date picker: a `YYYY-MM-DD` string or null, typed into a
 * DateFieldInput or chosen from a Calendar in a popup. Two shapes:
 *
 * - field shape: a DateFieldInput with an icon-only DatePickerTrigger inside it, at its end;
 * - button shape: a DatePickerTrigger alone, showing your formatted date.
 *
 * DatePickerContent holds a Calendar, gated on Content's own `state.open()`. Bind the form on
 * the picker, never on the Calendar inside it.
 *
 * @example
 * ```html
 * <div fold__Field>
 *   <span fold__FieldLabel>Due date</span>
 *   <div fold__DatePicker [formField]="form.dueDate">
 *     <div fold__DateFieldInput>
 *       <button fold__DatePickerTrigger aria-label="Choose due date"></button>
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
  selector: "[fold__DatePicker]",
  exportAs: "fold__DatePicker",
  hostDirectives: [
    {
      directive: OrigamiDatePicker,
      inputs: ["value", "open", "locale", "disabled", "readonly"],
      outputs: ["valueChange", "openChange", "touch"],
    },
  ],
  host: { "data-slot": "date-picker", "[class]": "classes()" },
})
export class DatePicker {
  readonly class = input("");

  readonly #picker = inject(OrigamiDatePicker);

  /** Origami's readonly observation: `value`, `open`, `disabled`, `readonly`, `segments`. */
  readonly state = this.#picker.state;

  /** Signal Forms' `focusBoundControl()` calls this; it focuses the first segment or the Trigger. */
  focus(options?: FocusOptions): void {
    this.#picker.focus(options);
  }

  /** Discards a half-typed draft and its parse error, and writes null. */
  clear(): void {
    this.#picker.clear();
  }

  protected readonly classes = computed(() => cn("block min-w-0", this.class()));
}
