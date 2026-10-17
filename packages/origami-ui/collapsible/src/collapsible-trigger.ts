import { DestroyRef, Directive, computed, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { CollapsibleContext } from "./collapsible";

/** Effective Trigger identity; independent of its generated default and reactive when replaced. */
export abstract class OrigamiCollapsibleTriggerOptions {
  /** Effective DOM ID, authoritative for the mounted Panel's `aria-labelledby`. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the Trigger's entire effective Options.
   * @param type - Supplier of a compatible concrete or abstract provider class, resolved through a
   *   forward reference.
   * @returns A local provider.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiCollapsibleTriggerOptions>
      | AbstractType<OrigamiCollapsibleTriggerOptions>,
  ): Provider {
    return { provide: OrigamiCollapsibleTriggerOptions, useExisting: forwardRef(type) };
  }

  /**
   * Whole Trigger Options replacement supplying reactive `id`; unused defaults are not merged.
   * @param factory - Injection-context factory supplying the required `id` signal.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiCollapsibleTriggerOptions): Provider {
    return { provide: OrigamiCollapsibleTriggerOptions, useFactory: factory };
  }
}

/**
 * Native `type="button"` activation toggles effective expansion exactly once.
 * Enter/Space retain native button semantics; no custom keyboard handler is supplied.
 * Disabled user actions cannot write expansion. IDs and ARIA links follow effective Options;
 * `aria-controls` is absent when no Panel is mounted. Requires a nearest Collapsible owner.
 */
@Directive({
  selector: "button[ogCollapsibleTrigger]",
  providers: [OrigamiCollapsibleTriggerOptions.provideExisting(() => OrigamiCollapsibleTrigger)],
  host: {
    type: "button",
    "[id]": "effectiveId()",
    "[disabled]": "disabled()",
    "[attr.aria-expanded]": "expanded()",
    "[attr.aria-controls]": "panelId()",
    "[attr.aria-disabled]": "disabledAria()",
    "[attr.data-expanded]": "expandedAttribute()",
    "[attr.data-disabled]": "disabledAttribute()",
    "(click)": "activate()",
  },
})
export class OrigamiCollapsibleTrigger implements OrigamiCollapsibleTriggerOptions {
  /** Own ID input, default opaque hydration-stable generated identity. Static/bound IDs drive default Options; replacements supply effective ID instead. */
  readonly id = input(injectUniqueId("collapsible-trigger"));

  readonly #options = injectDeferred(OrigamiCollapsibleTriggerOptions);
  readonly #context = inject(CollapsibleContext);
  readonly #destroyRef = inject(DestroyRef);
  #destroyed = false;

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());
  /** @internal Native disabled host binding. */
  protected readonly disabled = this.#context.disabled;
  /** @internal Desired expanded ARIA observation. */
  protected readonly expanded = this.#context.expanded;
  /** @internal Mounted-only control association. */
  protected readonly panelId = this.#context.panelId;
  /** @internal Disabled ARIA observation. */
  protected readonly disabledAria = this.#context.disabledAria;
  /** @internal Desired expanded marker. */
  protected readonly expandedAttribute = this.#context.expandedAttribute;
  /** @internal Disabled marker. */
  protected readonly disabledAttribute = this.#context.disabledAttribute;

  /** Resolves the nearest Collapsible synchronously; an orphan fails Angular DI clearly. */
  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Registers this Trigger once Angular has set its inputs; a second mounted Trigger fails clearly. */
  ngOnInit(): void {
    this.#context.registerTrigger(this.#options, this.#destroyRef);
  }

  /** @internal Live native activation request, obeying effective disabled Options. */
  protected activate(): void {
    if (!this.#destroyed) {
      this.#context.toggle();
    }
  }
}
