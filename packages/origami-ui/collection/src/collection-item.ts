import { Directive, InjectionToken, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueValue } from "@loozo/origami-ui/utils";
import { CollectionContext } from "./collection";

// Module-private so Options retain structural compatibility in packaged declarations.
const itemReplacement = new InjectionToken<OrigamiCollectionItemOptions>(
  "Collection Item replacement",
);

/**
 * Effective item configuration, substitutable as a whole for direct or host-composed items.
 * Helpers return local replacement-and-alias arrays, safe to nest in `providers`.
 * Primitive defaults cannot override replacements when direct/host selectors co-match.
 */
export abstract class OrigamiCollectionItemOptions {
  /** Item value, defaulting to a generated value that is stable while mounted. No normalization is performed. */
  abstract readonly value: Signal<string>;

  /**
   * Uses an existing compatible concrete or abstract provider for the item's configuration.
   * @param type - Forward-reference supplier, resolved only after construction.
   * @returns A local replacement-and-alias provider array suitable for consumer host-directive composition.
   */
  static provideExisting(
    type: () => Type<OrigamiCollectionItemOptions> | AbstractType<OrigamiCollectionItemOptions>,
  ): Provider[] {
    return [
      { provide: itemReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiCollectionItemOptions, useExisting: itemReplacement },
    ];
  }

  /**
   * Replaces effective item configuration without merging unused directive defaults.
   * @param factory - Injection-context factory supplying the required value signal.
   * @returns A local replacement-and-alias provider array.
   */
  static provideFactory(factory: () => OrigamiCollectionItemOptions): Provider[] {
    return [
      { provide: itemReplacement, useFactory: factory },
      { provide: OrigamiCollectionItemOptions, useExisting: itemReplacement },
    ];
  }

  /**
   * @internal Creates a fallback-only primitive default, independent of co-matched directive import order.
   * @param type - Default directive supplier, resolved lazily after construction only when no local replacement exists.
   * @returns A local array holding one Options factory; ancestor replacement tokens are deliberately ignored.
   */
  static ɵprovideDefault(type: () => Type<OrigamiCollectionItemOptions>): Provider[] {
    return [
      {
        provide: OrigamiCollectionItemOptions,
        useFactory: () => {
          const replacement = inject(itemReplacement, {
            self: true,
            optional: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject<OrigamiCollectionItemOptions>(forwardRef(type));
        },
      },
    ];
  }
}

/**
 * One item of its nearest logical Collection owner. Construction captures the item's
 * registration unpublished; it publishes in `ngOnInit`, once Angular has set its inputs, so
 * readers never see an item's default value in place of its bound one. Options are resolved
 * later, avoiding consumer/host-directive construction cycles. Helper-provided replacements
 * override the default even when direct and host-composed selectors co-match. Caller-scoped
 * destruction removes only this item. An orphan fails Angular DI clearly.
 */
@Directive({
  selector: "[ogCollectionItem]",
  exportAs: "ogCollectionItem",
  providers: [OrigamiCollectionItemOptions.ɵprovideDefault(() => OrigamiCollectionItem)],
})
export class OrigamiCollectionItem implements OrigamiCollectionItemOptions {
  /**
   * Own value input, default a generated value that is unique in the application and isn't
   * guaranteed to match across hydration, so persistent domain identity should use explicit values.
   * Replaced Options supply effective values instead of this unused default.
   */
  readonly value = input(injectUniqueValue("collection-item"));

  readonly #member = inject(CollectionContext).member(injectDeferred(OrigamiCollectionItemOptions));

  /** @internal Publishes this item once Angular has set its inputs. */
  ngOnInit(): void {
    this.#member.publish();
  }
}
