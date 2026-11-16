import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiField } from "@loozo/origami-ui/field";
import type { VariantProps } from "tailwind-variants";
import { tv } from "../cn";

export const fieldVariants = tv({
  base: "group/field",
  variants: {
    orientation: {
      vertical: "flex flex-col gap-1.5",
      horizontal: [
        "grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(1.5rem,auto)] items-center gap-x-2 gap-y-1",
        "*:not-first:col-start-2",
      ],
    },
  },
  defaultVariants: { orientation: "vertical" },
});

export type FieldOrientation = NonNullable<VariantProps<typeof fieldVariants>["orientation"]>;

/**
 * Lays out a label, a control, descriptions and errors, and wires them together through Origami's
 * Field. `state` is the Signal Forms state of its control's `[formField]`, for gating errors.
 *
 * `orientation="vertical"` (the default) stacks them. `orientation="horizontal"` is an option row
 * for a Checkbox or Switch: the control comes first, and the label, descriptions and errors sit
 * beside it in a second column.
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
 *
 * <div fold__Field orientation="horizontal">
 *   <button fold__Checkbox [formField]="form.terms"></button>
 *   <label fold__FieldLabel>Accept the terms</label>
 * </div>
 * ```
 */
@Directive({
  selector: "[fold__Field]",
  exportAs: "fold__Field",
  hostDirectives: [OrigamiField],
  host: {
    "data-slot": "field",
    "[attr.data-orientation]": "orientation()",
    "[class]": "classes()",
  },
})
export class Field {
  readonly orientation = input<FieldOrientation>("vertical");
  readonly class = input("");

  /** Origami's Field state: `errorsShown`, `errors`, `invalid`, `touched`, `disabled`, `required`. */
  readonly state = inject(OrigamiField).state;

  protected readonly classes = computed(() =>
    fieldVariants({ orientation: this.orientation(), class: this.class() }),
  );
}
