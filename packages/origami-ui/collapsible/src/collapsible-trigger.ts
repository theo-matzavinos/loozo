import {
  DestroyRef,
  Directive,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { CollapsibleContext } from "./collapsible";

/** Effective Trigger identity and disabled policy; independent of the direct defaults and reactive when replaced. */
export abstract class OrigamiCollapsibleTriggerOptions {
  /** Effective DOM ID, authoritative for the mounted Panel's `aria-labelledby`. */
  abstract readonly id: Signal<string>;
  /**
   * Blocks this Trigger's user activation, combined with the root's disabled; direct default false.
   * The root's `data-disabled` and State keep reporting only the root's own disabled policy.
   */
  abstract readonly disabled: Signal<boolean>;
  /**
   * While the Trigger is disabled, it keeps its tab stop: `aria-disabled="true"` and
   * `data-disabled` without native `disabled`. Activation stays blocked, but the button's own
   * `(click)` listeners still run. Direct default false.
   */
  abstract readonly focusableWhenDisabled: Signal<boolean>;

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
   * Whole Trigger Options replacement; unused directive defaults are not merged.
   * @param factory - Injection-context factory supplying `id`, `disabled` and
   *   `focusableWhenDisabled` signals.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiCollapsibleTriggerOptions): Provider {
    return { provide: OrigamiCollapsibleTriggerOptions, useFactory: factory };
  }
}

/**
 * Native `type="button"` activation toggles effective expansion exactly once.
 * Enter/Space retain native button semantics; no custom keyboard handler is supplied.
 * The Trigger is disabled while the root or its own Options are; then user actions cannot write
 * expansion, and its composed `ogButton` sets native `disabled` unless `focusableWhenDisabled`,
 * `aria-disabled="true"` and `data-disabled`. IDs and ARIA links follow effective Options;
 * `aria-controls` is absent when no Panel is mounted. Requires a nearest Collapsible owner.
 */
@Directive({
  selector: "button[ogCollapsibleTrigger]",
  hostDirectives: [OrigamiButton],
  providers: [
    OrigamiCollapsibleTriggerOptions.provideExisting(() => OrigamiCollapsibleTrigger),
    OrigamiButtonOptions.provideFactory(() => {
      const trigger = inject(OrigamiCollapsibleTriggerOptions);
      const context = inject(CollapsibleContext);

      return {
        disabled: computed(() => context.disabled() || trigger.disabled()),
        focusableWhenDisabled: trigger.focusableWhenDisabled,
      };
    }),
  ],
  host: {
    "[id]": "effectiveId()",
    "[attr.aria-expanded]": "expanded()",
    "[attr.aria-controls]": "panelId()",
    "[attr.data-expanded]": "expandedAttribute()",
    "(click)": "activate()",
  },
})
export class OrigamiCollapsibleTrigger implements OrigamiCollapsibleTriggerOptions {
  /** Own ID input, default opaque hydration-stable generated identity. Static/bound IDs drive default Options; replacements supply effective ID instead. */
  readonly id = input(injectUniqueId("collapsible-trigger"));
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own input keeping the disabled Trigger focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });

  readonly #options = injectDeferred(OrigamiCollapsibleTriggerOptions);
  readonly #context = inject(CollapsibleContext);
  readonly #destroyRef = inject(DestroyRef);
  #destroyed = false;

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());
  /** Root or own disabled policy, the activation guard. */
  readonly #effectiveDisabled = computed(
    () => this.#context.disabled() || this.#options().disabled(),
  );
  /** @internal Desired expanded ARIA observation. */
  protected readonly expanded = this.#context.expanded;
  /** @internal Mounted-only control association. */
  protected readonly panelId = this.#context.panelId;
  /** @internal Desired expanded marker. */
  protected readonly expandedAttribute = this.#context.expandedAttribute;

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

  /** @internal Live native activation request, obeying the root's and own effective disabled Options. */
  protected activate(): void {
    if (!this.#destroyed && !this.#effectiveDisabled()) {
      this.#context.toggle();
    }
  }
}
