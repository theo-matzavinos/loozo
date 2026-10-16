import {
  Directive,
  ElementRef,
  InjectionToken,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { PopoverContext } from "./popover";

const anchorReplacement = new InjectionToken<OrigamiPopoverAnchorOptions>(
  "OrigamiPopoverAnchorOptions replacement",
);

/** Substitutable standalone Anchor identity. Co-located Trigger Options take precedence for the shared DOM ID. */
export abstract class OrigamiPopoverAnchorOptions {
  /** Effective reactive standalone DOM ID; never used as the private positioning association. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the entire Anchor configuration.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns Local replacement and public alias providers, preserved when the primitive also matches directly in either import order.
   */
  static provideExisting(
    type: () => Type<OrigamiPopoverAnchorOptions> | AbstractType<OrigamiPopoverAnchorOptions>,
  ): Provider[] {
    return [
      { provide: anchorReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiPopoverAnchorOptions, useExisting: anchorReplacement },
    ];
  }

  /**
   * Substitutes the standalone Anchor's effective ID signal.
   * @param factory - Injection-context factory supplying `id`.
   * @returns Local replacement and public alias providers, not a merge with unused defaults.
   */
  static provideFactory(factory: () => OrigamiPopoverAnchorOptions): Provider[] {
    return [
      { provide: anchorReplacement, useFactory: factory },
      { provide: OrigamiPopoverAnchorOptions, useExisting: anchorReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback provider, not a supported application API.
   * @param type - Deferred Anchor default, resolved only when Options are read after construction.
   * @returns A local array holding one public-token factory that honors a same-host replacement before resolving the directive default.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiPopoverAnchorOptions> | AbstractType<OrigamiPopoverAnchorOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiPopoverAnchorOptions,
        useFactory: () => {
          const replacement = inject(anchorReplacement, {
            optional: true,
            self: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject(type());
        },
      },
    ];
  }
}

/**
 * Explicit positioning reference, required even when it shares the Trigger's native element.
 * Standalone Anchor uses its own effective ID; co-location uses Trigger Options for the shared ID.
 * Anchor's computed direction and writing mode define placement axes. Requires a nearest root;
 * duplicate mounted Anchor roles fail. No CSS anchor or source association is installed.
 */
@Directive({
  selector: "[ogPopoverAnchor]",
  providers: [OrigamiPopoverAnchorOptions.ɵprovideDefault(() => OrigamiPopoverAnchor)],
  host: { "[id]": "effectiveId()" },
})
export class OrigamiPopoverAnchor implements OrigamiPopoverAnchorOptions {
  /** Own standalone ID input, default a generated opaque hosted identity. Co-located Trigger Options override the shared DOM ID. */
  readonly id = input(injectUniqueId("popover-anchor"));
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #options = injectDeferred(OrigamiPopoverAnchorOptions);
  readonly #context = inject(PopoverContext);
  /** @internal Shared identity resolves from the Trigger token, not the Trigger directive instance. */
  protected readonly effectiveId = computed(() =>
    this.#context.anchorId(this.#element, this.#options),
  );

  /** Registers this independent role with caller-scoped teardown; Trigger/Anchor co-location is valid. */
  constructor() {
    this.#context.registerAnchor(injectDeferred(OrigamiPopoverAnchorOptions));
  }
}
