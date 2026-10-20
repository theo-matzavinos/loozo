import { DestroyRef, Directive, computed, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { FieldContext } from "./field";

/** Effective Error identity, named by its Field's control. */
export abstract class OrigamiFieldErrorOptions {
  /** Effective DOM ID; the Field's control names it in `aria-describedby` while it is mounted. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the Error's entire effective Options.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiFieldErrorOptions> | AbstractType<OrigamiFieldErrorOptions>,
  ): Provider {
    return { provide: OrigamiFieldErrorOptions, useExisting: forwardRef(type) };
  }

  /**
   * Substitutes reactive Error identity.
   * @param factory - Runs in injection context and supplies the required `id` signal.
   * @returns A local provider; defaults on an unused directive cannot repair missing Options.
   */
  static provideFactory(factory: () => OrigamiFieldErrorOptions): Provider {
    return { provide: OrigamiFieldErrorOptions, useFactory: factory };
  }
}

/**
 * A validation message for its nearest Field's control. It binds its effective `id`, and the
 * control's `aria-describedby` names it while it is mounted, after every `ogFieldDescription`,
 * with several Errors in the order they registered. Render it under
 * `@if (field.state.errorsShown())`: mounting and unmounting it adds and removes it from
 * `aria-describedby`. The message text is yours; `state.errors()` holds Signal Forms' errors.
 * It registers once Angular has set its inputs. Outside a Field it binds only its `id`.
 *
 * @example
 * ```html
 * @if (email.state.errorsShown()) {
 *   <p ogFieldError>{{ email.state.errors()[0]?.message }}</p>
 * }
 * ```
 */
@Directive({
  selector: "[ogFieldError]",
  providers: [OrigamiFieldErrorOptions.provideExisting(() => OrigamiFieldError)],
  host: { "[id]": "effectiveId()" },
})
export class OrigamiFieldError implements OrigamiFieldErrorOptions {
  /** Own ID input, default opaque hydration-stable generated identity. Static/bound IDs drive default Options; replacements supply effective ID instead. */
  readonly id = input(injectUniqueId("field-error"));

  readonly #options = injectDeferred(OrigamiFieldErrorOptions);
  readonly #field = inject(FieldContext, { optional: true });
  readonly #destroyRef = inject(DestroyRef);

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());

  /** @internal Joins the nearest Field's errors once Angular has set its inputs. */
  ngOnInit(): void {
    this.#field?.registerError({ id: () => this.#options().id() }, this.#destroyRef);
  }
}
