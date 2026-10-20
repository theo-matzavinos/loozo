import { DestroyRef, Directive, computed, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { ɵOrigamiFieldMembership } from "./field-membership";

/** Effective Control identity, named by its Field's Labels. */
export abstract class OrigamiFieldControlOptions {
  /** Effective DOM ID; each `ogFieldLabel` of the Field names it with `for`. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the Control's entire effective Options.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiFieldControlOptions> | AbstractType<OrigamiFieldControlOptions>,
  ): Provider {
    return { provide: OrigamiFieldControlOptions, useExisting: forwardRef(type) };
  }

  /**
   * Substitutes reactive Control identity.
   * @param factory - Runs in injection context and supplies the required `id` signal.
   * @returns A local provider; defaults on an unused directive cannot repair missing Options.
   */
  static provideFactory(factory: () => OrigamiFieldControlOptions): Provider {
    return { provide: OrigamiFieldControlOptions, useFactory: factory };
  }
}

/**
 * Makes a native `<input>`, `<select>` or `<textarea>` the control of its nearest Field. It binds
 * its effective `id`, which the Field's Labels name with `for`, and `aria-describedby`, naming
 * the Field's Descriptions and then its mounted Errors. With `[formField]` on the same element it
 * also binds `aria-invalid="true"` while the Field shows errors, absent otherwise; it binds no
 * `aria-required` or `aria-readonly`, since `[formField]` sets the native `required` and
 * `readonly`. Inside a Field it owns `aria-describedby` and `aria-invalid`: a static
 * `aria-describedby` is replaced, so add hints with `ogFieldDescription`.
 *
 * It isn't a Signal Forms control itself: it declares no value, touch or form-state inputs, so
 * `[formField]` keeps Angular's native handling of the element, its value, `touched` on blur and
 * native `disabled`, `required` and `readonly`. Origami's own form controls join a Field without
 * it. Outside a Field it binds only its `id` and keeps its static ARIA attributes. It registers
 * once Angular has set its inputs; a second control in one Field is reported through Angular's
 * `ErrorHandler` and ignored, keeping its static ARIA attributes too.
 *
 * @example
 * ```html
 * <input ogFieldControl type="email" [formField]="form.email" />
 * ```
 */
@Directive({
  selector: "[ogFieldControl]",
  providers: [OrigamiFieldControlOptions.provideExisting(() => OrigamiFieldControl)],
  host: {
    "[id]": "effectiveId()",
    "[attr.aria-describedby]": "describedBy()",
    "[attr.aria-invalid]": "invalid()",
  },
})
export class OrigamiFieldControl implements OrigamiFieldControlOptions {
  /** Own ID input, default opaque hydration-stable generated identity. Static/bound IDs drive default Options; replacements supply effective ID instead. */
  readonly id = input(injectUniqueId("field-control"));

  readonly #options = injectDeferred(OrigamiFieldControlOptions);
  readonly #destroyRef = inject(DestroyRef);
  readonly #membership = new ɵOrigamiFieldMembership(() => this.#options().id(), {
    labelable: true,
  });

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());
  /** @internal The Field's Descriptions, then its mounted Errors. */
  protected readonly describedBy = this.#membership.describedBy;
  /** @internal Errors-shown state. */
  protected readonly invalid = this.#membership.invalid;

  /** @internal Joins the nearest Field once Angular has set its inputs. */
  ngOnInit(): void {
    this.#membership.register(this.#destroyRef);
  }
}
