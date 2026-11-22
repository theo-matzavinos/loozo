import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiFileField } from "@loozo/origami-ui/file-field";
import { cn } from "../cn";

/**
 * A one-file picker over Origami's File field: write a FileFieldButton or a FileFieldDropZone
 * around a hidden FileFieldInput, and a FileFieldValue for the chosen file's name and size,
 * optionally with a FileFieldClear inside it to empty the field. It lays them out in a wrapping
 * row, so a button and its value share a line, a narrow row puts the value under the button, and a
 * full-width zone puts it under the zone.
 *
 * @example
 * ```html
 * <div fold__Field>
 *   <label fold__FieldLabel>Invoice</label>
 *   <div fold__FileField [formField]="billing.invoice">
 *     <label fold__FileFieldButton>
 *       Choose file <input fold__FileFieldInput accept=".pdf,.jpg,.jpeg,.png" />
 *     </label>
 *     <p fold__FileFieldValue>
 *       <button fold__FileFieldClear aria-label="Remove the invoice"></button>
 *     </p>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[fold__FileField]",
  exportAs: "fold__FileField",
  hostDirectives: [
    {
      directive: OrigamiFileField,
      inputs: ["value", "disabled"],
      outputs: ["valueChange", "touch"],
    },
  ],
  host: { "data-slot": "file-field", "[class]": "classes()" },
})
export class FileField {
  readonly class = input("");

  readonly #field = inject(OrigamiFileField);

  /** Origami's readonly observation: `value` (the chosen `File` or null) and `disabled`. */
  readonly state = this.#field.state;

  /** Signal Forms' `focusBoundControl()` calls this; it focuses the Input. */
  focus(options?: FocusOptions): void {
    this.#field.focus(options);
  }

  protected readonly classes = computed(() =>
    cn("group/file-field flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2", this.class()),
  );
}
