import {
  DestroyRef,
  Directive,
  InjectionToken,
  Service,
  computed,
  forwardRef,
  inject,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { OrigamiCollection, OrigamiCollectionState } from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";

// Private, per-role replacement tokens keep public Options structurally implementable.
const sharedReplacement = new InjectionToken<OrigamiAccordionOptions>(
  "Accordion shared replacement",
);

/**
 * Shared effective root configuration; deliberately contains no mode-specific selection fields.
 * By default this token resolves the owning root's effective Single or Multiple Options, so its
 * disabled signal supplies the shared policy. Replacing this shared token changes that policy
 * independently; selection and Single's clearing policy still come from the mode-specific
 * Options token. Replacing mode Options alone also updates the default shared policy.
 * Replacements are whole configurations, not merges with unused directive inputs.
 * Provider helpers return local replacement-plus-alias arrays, safe to nest in `providers`.
 * Primitive defaults never override those replacements when direct/host selectors co-match.
 *
 * @example
 * ```ts
 * // Replaces Single configuration; the default shared token observes this disabled signal.
 * OrigamiAccordionSingleOptions.provideFactory(() => ({
 *   value: signal<string | null>(null),
 *   disabled: signal(false),
 *   collapsible: signal(false),
 * }));
 * ```
 */
export abstract class OrigamiAccordionOptions {
  /** Blocks item user requests in combination with item disabled input; default false. External selection writes remain authoritative. */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces shared root configuration with an existing provider.
   * @param type - Compatible concrete or abstract class supplier, allowing forward references.
   * @returns A local replacement-and-alias provider array; mode selection still comes from its own token.
   */
  static provideExisting(
    type: () => Type<OrigamiAccordionOptions> | AbstractType<OrigamiAccordionOptions>,
  ): Provider[] {
    return [
      { provide: sharedReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiAccordionOptions, useExisting: sharedReplacement },
    ];
  }

  /**
   * Replaces the entire shared configuration.
   * @param factory - Injection-context factory supplying the required disabled signal.
   * @returns A local replacement-and-alias provider array, without fallback to unused directive inputs.
   */
  static provideFactory(factory: () => OrigamiAccordionOptions): Provider[] {
    return [
      { provide: sharedReplacement, useFactory: factory },
      { provide: OrigamiAccordionOptions, useExisting: sharedReplacement },
    ];
  }

  /**
   * @internal Creates a fallback-only default that cannot displace a helper-provided local replacement.
   * @param type - Default provider supplier, resolved lazily after construction when no local replacement exists.
   * @returns A local array holding one Options factory, ignoring ancestor replacement tokens.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiAccordionOptions> | AbstractType<OrigamiAccordionOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiAccordionOptions,
        useFactory: () => {
          const replacement = inject(sharedReplacement, {
            self: true,
            optional: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject<OrigamiAccordionOptions>(forwardRef(type));
        },
      },
    ];
  }
}

export abstract class Selection {
  abstract selected(value: string): boolean;
  abstract locked(value: string): boolean;
  abstract request(value: string, expanded: boolean): void;
}

@Service({ autoProvided: false })
export class AccordionContext {
  readonly #options = injectDeferred(OrigamiAccordionOptions);
  readonly #selection = injectDeferred(Selection);
  #destroyed = false;

  readonly disabled = computed(() => this.#options().disabled());

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  selected(value: string): boolean {
    return this.#selection().selected(value);
  }

  locked(value: string): boolean {
    return this.#selection().locked(value);
  }

  request(value: string, expanded: boolean): void {
    if (!this.#destroyed && !this.disabled()) {
      this.#selection().request(value, expanded);
    }
  }
}

/** Locally provided readonly observation of the nearest Single or Multiple root. */
@Service({ autoProvided: false })
export class OrigamiAccordionState {
  readonly #collection = inject(OrigamiCollectionState);
  readonly #context = inject(AccordionContext);

  /** Mounted effective item values in Collection DOM order; value edits/removal never normalize selection. */
  readonly itemValues: Signal<readonly string[]> = computed(() => {
    const values: string[] = [];

    for (const item of this.#collection.items()) {
      values.push(item.value());
    }

    return values;
  });
  /** Effective shared root disabled policy, without a writable alias. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
}

/**
 * @internal Compiler/composition support export retained for package compatibility.
 * Composes Collection and provides the local Accordion Context/State. Not a supported
 * application authoring API; consumers use the concrete Single or Multiple root.
 */
@Directive({
  hostDirectives: [OrigamiCollection],
  providers: [AccordionContext, OrigamiAccordionState],
})
export class ɵOrigamiAccordionRoot {}
