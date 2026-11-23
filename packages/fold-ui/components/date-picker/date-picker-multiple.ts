import { Directive, computed, forwardRef, inject, input } from "@angular/core";
import { OrigamiDatePickerMultiple } from "@loozo/origami-ui/date-picker";
import { cn } from "../cn";
import { DatePickerRoot } from "./date-picker-root";

/**
 * A picker for several days over Origami's Date picker multiple: `YYYY-MM-DD` strings, chosen
 * from a CalendarMultiple in a popup. Button shape only: a DatePickerTrigger showing your text,
 * such as a count. A choice toggles a day and keeps the popup open, so give it a Done button in
 * a DatePickerFooter that writes `open`; Escape, a click outside and Tab close it too.
 *
 * DatePickerContent holds a CalendarMultiple, gated on Content's own `state.open()`. Bind the
 * form on the picker, never on the Calendar inside it.
 *
 * @example
 * ```html
 * <div fold__Field>
 *   <span fold__FieldLabel>Holidays</span>
 *   <div fold__DatePickerMultiple [formField]="form.holidays" [(open)]="holidaysOpen" #holidays="fold__DatePickerMultiple">
 *     <button fold__DatePickerTrigger>{{ holidays.state.value().length }} days</button>
 *     <div fold__DatePickerContent #content="fold__DatePickerContent">
 *       @if (content.state.open()) {
 *         <div fold__CalendarMultiple [weekStart]="1" selectedDescription="selected"></div>
 *         <div fold__DatePickerFooter>
 *           <button fold__Button size="sm" (click)="holidaysOpen.set(false)">Done</button>
 *         </div>
 *       }
 *     </div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[fold__DatePickerMultiple]",
  exportAs: "fold__DatePickerMultiple",
  hostDirectives: [
    {
      directive: OrigamiDatePickerMultiple,
      inputs: ["value", "open", "disabled", "readonly"],
      outputs: ["valueChange", "openChange", "touch"],
    },
  ],
  providers: [{ provide: DatePickerRoot, useExisting: forwardRef(() => DatePickerMultiple) }],
  host: { "data-slot": "date-picker", "[class]": "classes()" },
})
export class DatePickerMultiple extends DatePickerRoot {
  readonly class = input("");

  readonly #picker = inject(OrigamiDatePickerMultiple);

  /** Origami's readonly observation: `value`, `open`, `disabled`, `readonly`. */
  readonly state = this.#picker.state;

  /** Signal Forms' `focusBoundControl()` calls this; it focuses the Trigger. */
  focus(options?: FocusOptions): void {
    this.#picker.focus(options);
  }

  protected readonly classes = computed(() => cn("block min-w-0", this.class()));
}
