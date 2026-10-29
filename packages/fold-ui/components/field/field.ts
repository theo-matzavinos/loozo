import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiField } from "@loozo/origami-ui/field";
import { cn } from "../cn";

/**
 * Stacks a label, a control, descriptions and errors, and wires them together through Origami's
 * Field. `state` is the Signal Forms state of its control's `[formField]`, for gating errors.
 *
 * @example
 * ```html
 * <div fold__Field #email="fold__Field">
 *   <label fold__FieldLabel>Email</label>
 *   <input fold__Input type="email" [formField]="form.email" />
 *   @if (email.state.errorsShown()) {
 *     <p fold__FieldError>{{ email.state.errors()[0]?.message }}</p>
 *   }
 * </div>
 * ```
 */
@Directive({
  selector: "[fold__Field]",
  exportAs: "fold__Field",
  hostDirectives: [OrigamiField],
  host: { "data-slot": "field", "[class]": "classes()" },
})
export class Field {
  readonly class = input("");

  /** Origami's Field state: `errorsShown`, `errors`, `invalid`, `touched`, `disabled`, `required`. */
  readonly state = inject(OrigamiField).state;

  protected readonly classes = computed(() =>
    cn("group/field flex flex-col gap-1.5", this.class()),
  );
}
