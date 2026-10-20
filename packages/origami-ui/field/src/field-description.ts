import { DestroyRef, Directive, computed, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { FieldContext } from "./field";

/** Effective Description identity, named by its Field's control. */
export abstract class OrigamiFieldDescriptionOptions {
  /** Effective DOM ID; the Field's control names it in `aria-describedby` while it is mounted. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the Description's entire effective Options.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiFieldDescriptionOptions> | AbstractType<OrigamiFieldDescriptionOptions>,
  ): Provider {
    return { provide: OrigamiFieldDescriptionOptions, useExisting: forwardRef(type) };
  }

  /**
   * Substitutes reactive Description identity.
   * @param factory - Runs in injection context and supplies the required `id` signal.
   * @returns A local provider; defaults on an unused directive cannot repair missing Options.
   */
  static provideFactory(factory: () => OrigamiFieldDescriptionOptions): Provider {
    return { provide: OrigamiFieldDescriptionOptions, useFactory: factory };
  }
}

/**
 * Hint text for its nearest Field's control, such as a format or a privacy note. It binds its
 * effective `id`, and the control's `aria-describedby` names it while it is mounted, before every
 * `ogFieldError`, with several Descriptions in the order they registered. It registers once
 * Angular has set its inputs. Outside a Field it binds only its `id`.
 *
 * @example
 * ```html
 * <p ogFieldDescription>We never share it.</p>
 * ```
 */
@Directive({
  selector: "[ogFieldDescription]",
  providers: [OrigamiFieldDescriptionOptions.provideExisting(() => OrigamiFieldDescription)],
  host: { "[id]": "effectiveId()" },
})
export class OrigamiFieldDescription implements OrigamiFieldDescriptionOptions {
  /** Own ID input, default opaque hydration-stable generated identity. Static/bound IDs drive default Options; replacements supply effective ID instead. */
  readonly id = input(injectUniqueId("field-description"));

  readonly #options = injectDeferred(OrigamiFieldDescriptionOptions);
  readonly #field = inject(FieldContext, { optional: true });
  readonly #destroyRef = inject(DestroyRef);

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());

  /** @internal Joins the nearest Field's descriptions once Angular has set its inputs. */
  ngOnInit(): void {
    this.#field?.registerDescription({ id: () => this.#options().id() }, this.#destroyRef);
  }
}
