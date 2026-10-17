import { DestroyRef, Directive, Service, computed, forwardRef, inject } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { OrigamiCollection, OrigamiCollectionState } from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";

/**
 * Shared effective root configuration; deliberately contains no mode-specific selection fields.
 * By default this token resolves the owning root's effective Single or Multiple Options, so its
 * disabled signal supplies the shared policy. Replacing this shared token changes that policy
 * independently; selection and Single's clearing policy still come from the mode-specific
 * Options token. Replacing mode Options alone also updates the default shared policy.
 * Replacements are whole configurations, not merges with unused directive inputs.
 * Provider helpers return one local provider.
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
   * @returns A local provider; mode selection still comes from its own token.
   */
  static provideExisting(
    type: () => Type<OrigamiAccordionOptions> | AbstractType<OrigamiAccordionOptions>,
  ): Provider {
    return { provide: OrigamiAccordionOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the entire shared configuration.
   * @param factory - Injection-context factory supplying the required disabled signal.
   * @returns A local provider, without fallback to unused directive inputs.
   */
  static provideFactory(factory: () => OrigamiAccordionOptions): Provider {
    return { provide: OrigamiAccordionOptions, useFactory: factory };
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

  /**
   * Effective values of the items Angular has initialized, in DOM order as of the latest insertion
   * or removal: a keyed move that keeps the same items notifies no reader. Value edits and removal
   * never normalize selection.
   */
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
