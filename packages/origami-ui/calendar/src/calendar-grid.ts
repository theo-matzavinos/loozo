import { DestroyRef, Directive, ElementRef, computed, inject } from "@angular/core";
import { ɵOrigamiFieldMembership } from "@loozo/origami-ui/field";
import { ɵOrigamiDescribedBy } from "@loozo/origami-ui/utils";
import { CalendarContext } from "./calendar-context";

/**
 * The grid of an `ogCalendar`, usually a `<table>`: static `role="grid"` (a consumer's static
 * `role` overrides it), with `aria-multiselectable="true"` only where several days can be
 * selected, `aria-disabled="true"` while the root is disabled and `aria-readonly="true"` while
 * it is readonly. Render its rows from the root's `state.weeks()` and give each day an
 * `ogCalendarCell`. Use explicit `<thead>`/`<tbody>` so the browser inserts no element that
 * server rendering didn't, and a `<th scope="col" [attr.abbr]="weekday.long">` per weekday.
 *
 * It is the control of its nearest `ogField`, governed by the `[formField]` on the Calendar root,
 * and registers once Angular has set its inputs. Its `aria-labelledby` names the Field's Labels
 * while it is the Field's control, else the grid's own static `aria-labelledby` (from the
 * template or a composing directive's `host`), followed by the registered `ogCalendarHeading`,
 * so the month is part of the grid's name; a Heading still dehydrated in another `@defer`
 * boundary isn't named until it hydrates. A Label has no `for`, so clicking it does nothing. Its `aria-describedby` names the Field's Descriptions, then its
 * mounted Errors. `aria-invalid="true"` follows the Field's shown errors and `aria-required="true"`
 * the bound field; outside a Field, and as a second control the Field ignores, they keep their
 * static values. Requires a nearest Calendar root.
 */
@Directive({
  selector: "[ogCalendarGrid]",
  hostDirectives: [ɵOrigamiDescribedBy],
  host: {
    role: "grid",
    // The static default a consumer's static value overrides. Hydration writes the static
    // attributes onto the server's element before the Grid is created, so the element the Field
    // membership reads holds this default rather than the server's naming of the Heading.
    "aria-labelledby": "",
    "[attr.aria-labelledby]": "ariaLabelledBy()",
    "[attr.aria-multiselectable]": "ariaMultiselectable()",
    "[attr.aria-disabled]": "ariaDisabled()",
    "[attr.aria-readonly]": "ariaReadonly()",
    "[attr.aria-invalid]": "ariaInvalid()",
    "[attr.aria-required]": "ariaRequired()",
  },
})
export class OrigamiCalendarGrid {
  readonly #context = inject(CalendarContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  readonly #membership = new ɵOrigamiFieldMembership(() => this.#element.id, {
    labelable: false,
    formState: () => this.#context.formState(),
  });

  /**
   * @internal The Field's Labels (else the static value, the empty default without one), then
   * the registered Heading, each ID once.
   */
  protected readonly ariaLabelledBy = computed(() => {
    const heading = this.#context.headingId();
    const ids: string[] = [];

    for (const id of (this.#membership.labelledBy() ?? "").split(/\s+/)) {
      if (id !== "" && id !== heading && !ids.includes(id)) {
        ids.push(id);
      }
    }

    if (heading !== null) {
      ids.push(heading);
    }

    if (ids.length === 0) {
      return null;
    }

    return ids.join(" ");
  });
  /** @internal Present only where several days can be selected. */
  protected readonly ariaMultiselectable = computed(() => {
    if (this.#context.multiselectable()) {
      return "true";
    }

    return null;
  });
  /** @internal The root's disabled policy. */
  protected readonly ariaDisabled = computed(() => {
    if (this.#context.disabled()) {
      return "true";
    }

    return null;
  });
  /**
   * @internal The root's readonly policy, which `[formField]` writes from the field. Not the
   * static value: under hydration that would be the server's output.
   */
  protected readonly ariaReadonly = computed(() => {
    if (this.#context.readonly()) {
      return "true";
    }

    return null;
  });
  /** @internal The Field's shown errors inside a Field; otherwise the static value. */
  protected readonly ariaInvalid = this.#membership.invalid;
  /** @internal The bound field's `required()` inside a Field; otherwise the static value. */
  protected readonly ariaRequired = this.#membership.required;

  /** @internal Joins the nearest Field once Angular has set its inputs. */
  ngOnInit(): void {
    this.#membership.register(this.#destroyRef);
  }
}
