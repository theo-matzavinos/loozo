import {
  DestroyRef,
  Directive,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { PopoverContext } from "./popover";

/** Substitutable standalone Anchor identity. Co-located Trigger Options take precedence for the shared DOM ID. */
export abstract class OrigamiPopoverAnchorOptions {
  /** Effective reactive standalone DOM ID; never used as the private positioning association. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the entire Anchor configuration.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiPopoverAnchorOptions> | AbstractType<OrigamiPopoverAnchorOptions>,
  ): Provider {
    return { provide: OrigamiPopoverAnchorOptions, useExisting: forwardRef(type) };
  }

  /**
   * Substitutes the standalone Anchor's effective ID signal.
   * @param factory - Injection-context factory supplying `id`.
   * @returns A local provider, not a merge with unused defaults.
   */
  static provideFactory(factory: () => OrigamiPopoverAnchorOptions): Provider {
    return { provide: OrigamiPopoverAnchorOptions, useFactory: factory };
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
  providers: [OrigamiPopoverAnchorOptions.provideExisting(() => OrigamiPopoverAnchor)],
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

  readonly #destroyRef = inject(DestroyRef);

  /** @internal Registers this independent role once Angular has set its inputs; Trigger/Anchor co-location is valid. */
  ngOnInit(): void {
    this.#context.registerAnchor(
      { element: this.#element, options: this.#options },
      this.#destroyRef,
    );
  }
}
