import { DestroyRef, Directive, ElementRef, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueValue } from "@loozo/origami-ui/utils";
import { CollectionContext } from "./collection";

/**
 * Effective item configuration, substitutable as a whole for direct or host-composed items.
 * Helpers return one local provider.
 */
export abstract class OrigamiCollectionItemOptions {
  /** Item value, defaulting to a generated value that is stable while mounted. No normalization is performed. */
  abstract readonly value: Signal<string>;

  /**
   * Uses an existing compatible concrete or abstract provider for the item's configuration.
   * @param type - Forward-reference supplier, resolved only after construction.
   * @returns A local provider suitable for consumer host-directive composition.
   */
  static provideExisting(
    type: () => Type<OrigamiCollectionItemOptions> | AbstractType<OrigamiCollectionItemOptions>,
  ): Provider {
    return { provide: OrigamiCollectionItemOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces effective item configuration without merging unused directive defaults.
   * @param factory - Injection-context factory supplying the required value signal.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiCollectionItemOptions): Provider {
    return { provide: OrigamiCollectionItemOptions, useFactory: factory };
  }
}

/**
 * One item of its nearest logical Collection owner. It registers in `ngOnInit`, once Angular has
 * set its inputs, so readers never see an item's default value in place of its bound one. Options are resolved
 * later, avoiding consumer/host-directive construction cycles. Caller-scoped destruction removes
 * only this item. An orphan fails Angular DI clearly.
 */
@Directive({
  selector: "[ogCollectionItem]",
  exportAs: "ogCollectionItem",
  providers: [OrigamiCollectionItemOptions.provideExisting(() => OrigamiCollectionItem)],
})
export class OrigamiCollectionItem implements OrigamiCollectionItemOptions {
  /**
   * Own value input, default a generated value that is unique in the application and isn't
   * guaranteed to match across hydration, so persistent domain identity should use explicit values.
   * Replaced Options supply effective values instead of this unused default.
   */
  readonly value = input(injectUniqueValue("collection-item"));

  readonly #context = inject(CollectionContext);
  readonly #element = inject<ElementRef<Element>>(ElementRef).nativeElement;
  readonly #options = injectDeferred(OrigamiCollectionItemOptions);
  readonly #destroyRef = inject(DestroyRef);

  /** @internal Registers this item once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.register({ element: this.#element, options: this.#options }, this.#destroyRef);
  }
}
