import { DestroyRef, Directive, ElementRef, inject } from "@angular/core";
import { ɵOrigamiFieldMembership } from "@loozo/origami-ui/field";
import { ɵOrigamiDescribedBy } from "@loozo/origami-ui/utils";
import { DateFieldContext } from "./date-field-context";

/**
 * The segment group of a date field: static `role="group"` around the root's segments and
 * literals, and the control of its nearest `ogField`, governed by the `[formField]` on the date
 * field root. It may share the root's element when nothing else sits inside the root.
 *
 * Inside a Field its `aria-labelledby` names the Field's Labels, replacing a static value, and is
 * absent while there is none; a Label has no `for`, so clicking it does nothing. Each segment's
 * own `aria-labelledby` names the same labels and then the segment. Its `aria-describedby` names
 * the Field's Descriptions, then its mounted Errors, merged with the IDs of a co-applied
 * `ogTooltipTrigger` in the order they initialize. The segments carry `aria-invalid="true"` while
 * the Field shows its errors and `aria-required="true"` while the bound field is required.
 * Outside a Field, and as a second control the Field ignores, it keeps its static
 * `aria-labelledby`, which the segments name too.
 *
 * Focus leaving the group, not moving between its segments, is the root's `touch`. Requires a
 * nearest date field root, which supports one mounted Input; a second fails. It has no inputs
 * and no `state`: read the root's.
 */
@Directive({
  selector: "[ogDateFieldInput]",
  hostDirectives: [ɵOrigamiDescribedBy],
  host: {
    role: "group",
    "[attr.aria-labelledby]": "ariaLabelledBy()",
    "(focusout)": "focusLeft($event)",
  },
})
export class OrigamiDateFieldInput {
  readonly #context = inject(DateFieldContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  readonly #membership = new ɵOrigamiFieldMembership(() => this.#element.id, {
    labelable: false,
    formState: () => this.#context.formState(),
  });

  /** @internal The Field's Label IDs inside a Field; otherwise the static value. */
  protected readonly ariaLabelledBy = this.#membership.labelledBy;

  /** @internal Joins the nearest Field and registers with the root once Angular has set its inputs. */
  ngOnInit(): void {
    this.#membership.register(this.#destroyRef);
    this.#context.registerGroup(
      {
        element: this.#element,
        labelledBy: this.#membership.labelledBy,
        invalid: this.#membership.invalid,
        required: this.#membership.required,
      },
      this.#destroyRef,
    );
  }

  /** @internal Focus left the group, not for another of its segments: the root's `touch`. */
  protected focusLeft(event: FocusEvent): void {
    const next = event.relatedTarget;

    if (next instanceof Node && this.#element.contains(next)) {
      return;
    }

    this.#context.left();
  }
}
