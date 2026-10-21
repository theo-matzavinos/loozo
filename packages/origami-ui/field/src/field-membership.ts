import { ElementRef, computed, inject } from "@angular/core";
import type { DestroyRef } from "@angular/core";
import { FORM_FIELD } from "@angular/forms/signals";
import type { FieldState } from "@angular/forms/signals";
import { ɵOrigamiDescribedBy } from "@loozo/origami-ui/utils";
import { FieldContext } from "./field";
import type { FieldControlRegistration } from "./field";

/**
 * The ARIA attributes the element has before any binding runs. Angular writes an element's static
 * attributes, from its template and from every matched directive's `host`, before it creates the
 * element's directives, so the element itself holds them here; `HostAttributeToken` would see only
 * the template's, missing those of a directive that composes the control through `hostDirectives`.
 */
function staticAttributes(): {
  readonly invalid: string | null;
  readonly required: string | null;
  readonly readonly: string | null;
} {
  const element = inject<ElementRef<Element>>(ElementRef).nativeElement;

  return {
    invalid: element.getAttribute("aria-invalid"),
    required: element.getAttribute("aria-required"),
    readonly: element.getAttribute("aria-readonly"),
  };
}

function flag(value: boolean): "true" | null {
  if (value) {
    return "true";
  }

  return null;
}

/**
 * @internal Package-private: one form control's membership in its nearest Field, shared by every
 * Origami form control. Not an application authoring API.
 *
 * Construct it in the control's injection context, with the control's effective ID; call
 * `register` from the control's `ngOnInit`. The control composes `ɵOrigamiDescribedBy` through
 * `hostDirectives` and binds no `aria-describedby` itself: `register` adds the Field's
 * Descriptions, then its mounted Errors, to the element's shared description while the control
 * is the Field's control, and nothing otherwise. It reads the `[formField]` on the control's own
 * element (`FORM_FIELD`, self, optional) lazily, so its readers run after Angular has set that
 * binding. Outside a Field, and for a second control the Field ignored, each attribute is the
 * control's own static one, so a standalone control keeps what the consumer wrote.
 */
export class ɵOrigamiFieldMembership {
  readonly #field = inject(FieldContext, { optional: true });
  readonly #binding = inject(FORM_FIELD, { self: true, optional: true });
  readonly #registration: FieldControlRegistration;
  readonly #member = computed(() => this.#field?.control() === this.#registration);
  readonly #static = staticAttributes();
  readonly #describedBy = inject(ɵOrigamiDescribedBy, { self: true });

  /** `aria-invalid`: `"true"` while the Field shows its errors. */
  readonly invalid = computed(() => {
    if (!this.#member() || this.#field === null) {
      return this.#static.invalid;
    }

    return flag(this.#field.errorsShown());
  });
  /** `aria-required`: `"true"` while the bound field is required; for a control with no native `required`. */
  readonly required = computed(() => {
    if (!this.#member() || this.#field === null) {
      return this.#static.required;
    }

    return flag(this.#field.required());
  });
  /** `aria-readonly`: `"true"` while the bound field is readonly; for a control with no native `readonly`. */
  readonly readonly = computed(() => {
    if (!this.#member()) {
      return this.#static.readonly;
    }

    return flag(this.formState()?.readonly() ?? false);
  });

  /**
   * @param id - The control's effective DOM ID, read only after its `ngOnInit`.
   * @param options - `labelable`: whether a `<label for>` can name the control.
   */
  constructor(id: () => string, { labelable }: { readonly labelable: boolean }) {
    this.#registration = { id, labelable, formState: () => this.formState() };
  }

  /** The Signal Forms state bound on the control's element, or null without `[formField]`. */
  formState(): FieldState<unknown> | null {
    return this.#binding?.state() ?? null;
  }

  /**
   * Registers the control with its nearest Field, if any, and the Field's Descriptions, then its
   * mounted Errors, as the element's description while it is the Field's control; call from the
   * control's `ngOnInit`.
   */
  register(destroyRef: DestroyRef): void {
    this.#field?.registerControl(this.#registration, destroyRef);
    this.#describedBy.register(() => {
      if (!this.#member() || this.#field === null) {
        return [];
      }

      return this.#field.describedBy();
    }, destroyRef);
  }
}
