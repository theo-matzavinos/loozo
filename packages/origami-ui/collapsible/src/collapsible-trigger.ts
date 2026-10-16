import {
  DestroyRef,
  Directive,
  InjectionToken,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { CollapsibleContext } from "./collapsible";

const triggerReplacement = new InjectionToken<OrigamiCollapsibleTriggerOptions>(
  "Collapsible Trigger replacement",
);

/** Effective Trigger identity; independent of its generated default and reactive when replaced. */
export abstract class OrigamiCollapsibleTriggerOptions {
  /** Effective DOM ID, authoritative for the mounted Panel's `aria-labelledby`. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the Trigger's entire effective Options.
   * @param type - Supplier of a compatible concrete or abstract provider class, resolved through a
   *   forward reference.
   * @returns Local replacement and public-alias providers; a directly matched Trigger default cannot override this replacement.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiCollapsibleTriggerOptions>
      | AbstractType<OrigamiCollapsibleTriggerOptions>,
  ): Provider[] {
    return [
      { provide: triggerReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiCollapsibleTriggerOptions, useExisting: triggerReplacement },
    ];
  }

  /**
   * Whole Trigger Options replacement supplying reactive `id`; unused defaults are not merged.
   * @param factory - Injection-context factory supplying the required `id` signal.
   * @returns Local replacement and public-alias providers; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiCollapsibleTriggerOptions): Provider[] {
    return [
      { provide: triggerReplacement, useFactory: factory },
      { provide: OrigamiCollapsibleTriggerOptions, useExisting: triggerReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () =>
      | Type<OrigamiCollapsibleTriggerOptions>
      | AbstractType<OrigamiCollapsibleTriggerOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiCollapsibleTriggerOptions,
        useFactory: () => {
          const replacement = inject(triggerReplacement, {
            optional: true,
            self: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject(forwardRef(type));
        },
      },
    ];
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
  providers: [OrigamiCollapsibleTriggerOptions.ɵprovideDefault(() => OrigamiCollapsibleTrigger)],
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

  /** Registers this Trigger synchronously with caller-scoped teardown; duplicate roles fail clearly. */
  constructor() {
    this.#context.registerTrigger(injectDeferred(OrigamiCollapsibleTriggerOptions));
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Live native activation request, obeying effective disabled Options. */
  protected activate(): void {
    if (!this.#destroyed) {
      this.#context.toggle();
    }
  }
}
