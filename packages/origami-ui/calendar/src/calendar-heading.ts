import { DestroyRef, Directive, computed, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { CalendarContext } from "./calendar-context";

/** Effective Heading identity. */
export abstract class OrigamiCalendarHeadingOptions {
  /** Effective DOM ID, which the Grid's `aria-labelledby` names. */
  abstract readonly id: Signal<string>;

  /**
   * Replaces Heading Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiCalendarHeadingOptions> | AbstractType<OrigamiCalendarHeadingOptions>,
  ): Provider {
    return { provide: OrigamiCalendarHeadingOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Heading Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply `id`.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiCalendarHeadingOptions): Provider {
    return { provide: OrigamiCalendarHeadingOptions, useFactory: factory };
  }
}

/**
 * The visible period of a Calendar root: render the root's `state.heading()` in it ("October
 * 2026"). It binds its effective `id`, which the Grid's `aria-labelledby` names after any Field
 * Labels once the Heading registers, and static `aria-live="polite"`, so moving to another month
 * announces it. Use any element, such as an `<h2>`. One Heading per root: a second mounted
 * Heading fails clearly when it registers. Requires a nearest Calendar root.
 */
@Directive({
  selector: "[ogCalendarHeading]",
  providers: [OrigamiCalendarHeadingOptions.provideExisting(() => OrigamiCalendarHeading)],
  host: {
    "aria-live": "polite",
    "[id]": "effectiveId()",
  },
})
export class OrigamiCalendarHeading implements OrigamiCalendarHeadingOptions {
  /** Own ID input, default opaque hydration-stable generated identity; replaced Options supply the effective ID instead. */
  readonly id = input(injectUniqueId("calendar-heading"));

  readonly #options = injectDeferred(OrigamiCalendarHeadingOptions);
  readonly #context = inject(CalendarContext);
  readonly #destroyRef = inject(DestroyRef);

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());

  /** @internal Registers the ID with the Calendar once Angular has set its inputs; a second mounted Heading fails clearly. */
  ngOnInit(): void {
    this.#context.registerHeading(this.effectiveId, this.#destroyRef);
  }
}
