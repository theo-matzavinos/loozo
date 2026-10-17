import {
  DestroyRef,
  Directive,
  Service,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  model,
  signal,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import {
  ɵOrigamiRovingFocusContext,
  ɵOrigamiRovingFocusOptions,
} from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";

/** Tabs list axis: `horizontal` uses ArrowLeft/ArrowRight (reading-direction aware), `vertical` uses ArrowUp/ArrowDown. */
export type OrigamiTabsOrientation = "horizontal" | "vertical";

/** `automatic` selects a tab when arrow/Home/End focus reaches it; `manual` moves focus only, and Enter, Space or a click selects. */
export type OrigamiTabsActivation = "automatic" | "manual";

/** Effective root configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiTabsOptions {
  /**
   * Writable selected value; the direct directive model defaults to null. Null or a value no
   * Trigger has selects nothing and is never normalized. External writes remain authoritative.
   */
  abstract readonly value: WritableSignal<string | null>;
  /** Blocks user selection and removes the tab stop, not external configuration writes; default false. */
  abstract readonly disabled: Signal<boolean>;
  /** Arrow-key axis and `aria-orientation`; default `horizontal`. */
  abstract readonly orientation: Signal<OrigamiTabsOrientation>;
  /** Whether keyboard focus movement also selects; default `automatic`. */
  abstract readonly activation: Signal<OrigamiTabsActivation>;

  /**
   * Replaces Tabs Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiTabsOptions> | AbstractType<OrigamiTabsOptions>,
  ): Provider {
    return { provide: OrigamiTabsOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Tabs Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply all four required signals.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiTabsOptions): Provider {
    return { provide: OrigamiTabsOptions, useFactory: factory };
  }
}

type PartOptions = { readonly value: Signal<string>; readonly id: Signal<string> };

@Service({ autoProvided: false })
export class TabsContext {
  readonly #options = injectDeferred(OrigamiTabsOptions);
  readonly #triggers = signal<readonly (() => PartOptions)[]>([]);
  readonly #panels = signal<readonly (() => PartOptions)[]>([]);
  #destroyed = false;

  readonly value = computed(() => this.#options().value());
  readonly disabled = computed(() => this.#options().disabled());
  readonly orientation = computed(() => this.#options().orientation());
  readonly activation = computed(() => this.#options().activation());

  readonly disabledAttribute = computed(() => {
    if (this.disabled()) {
      return "";
    }

    return null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
    inject(ɵOrigamiRovingFocusContext).navigations.subscribe((value) => {
      if (this.activation() === "automatic") {
        this.select(value);
      }
    });
  }

  /** Registers a Trigger from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerTrigger(options: () => PartOptions, destroyRef: DestroyRef): void {
    this.#register(this.#triggers, options, destroyRef);
  }

  /** Registers a Panel from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerPanel(options: () => PartOptions, destroyRef: DestroyRef): void {
    this.#register(this.#panels, options, destroyRef);
  }

  /** ID of the first registered Trigger with `value`, or null. */
  triggerId(value: string): string | null {
    return this.#idOf(this.#triggers(), value);
  }

  /** ID of the first registered Panel with `value`, or null. */
  panelId(value: string): string | null {
    return this.#idOf(this.#panels(), value);
  }

  /** A user selection request; the caller has already applied its own disabled policy. */
  select(value: string): void {
    if (this.#destroyed || this.disabled()) {
      return;
    }

    const options = this.#options();

    if (options.value() !== value) {
      options.value.set(value);
    }
  }

  #idOf(registered: readonly (() => PartOptions)[], value: string): string | null {
    for (const part of registered) {
      const options = part();

      if (options.value() === value) {
        return options.id();
      }
    }

    return null;
  }

  /** A hook earlier in the part's view can destroy that view before the part's `ngOnInit` runs. */
  #register(
    slot: WritableSignal<readonly (() => PartOptions)[]>,
    options: () => PartOptions,
    destroyRef: DestroyRef,
  ): void {
    if (destroyRef.destroyed) {
      return;
    }

    slot.update((parts) => [...parts, options]);
    destroyRef.onDestroy(() => {
      const remaining: (() => PartOptions)[] = [];

      for (const mounted of slot()) {
        if (mounted !== options) {
          remaining.push(mounted);
        }
      }

      slot.set(remaining);
    });
  }
}

/** Locally provided readonly facade for the nearest Tabs root; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiTabsState {
  readonly #context = inject(TabsContext);

  /** Effective selected value, including null and values no mounted Trigger has. No writable alias is exposed. */
  readonly value: Signal<string | null> = this.#context.value;
  /** Effective root disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
  /** Effective list orientation. */
  readonly orientation: Signal<OrigamiTabsOrientation> = this.#context.orientation;
  /** Effective activation policy. */
  readonly activation: Signal<OrigamiTabsActivation> = this.#context.activation;
}

/**
 * Tabs root: owns one selected value for its Triggers and Panels through nearest logical
 * Angular DI; keyboard focus follows rendered DOM order. While the value is null
 * or no mounted Trigger has it, no Trigger is selected; a Panel shows whenever its value is the
 * root value. The model is never written without user action.
 * Root `data-orientation` and `data-disabled` reflect effective Options. Consumers own the
 * List's accessible name, Trigger labels, Panel content and styling. A Tabs root inside a
 * Panel is independent of its ancestor.
 *
 * @example
 * ```html
 * <section ogTabs [(value)]="view">
 *   <div ogTabsList aria-label="Demo views">
 *     <button ogTabsTrigger value="output">Output</button>
 *     <button ogTabsTrigger value="source">Source</button>
 *   </div>
 *   <div ogTabsPanel value="output">…</div>
 *   <div ogTabsPanel value="source">…</div>
 * </section>
 * ```
 */
@Directive({
  selector: "[ogTabs]",
  exportAs: "ogTabs",
  providers: [
    TabsContext,
    OrigamiTabsState,
    ɵOrigamiRovingFocusContext,
    ɵOrigamiRovingFocusOptions.provideFactory(() => {
      const context = inject(TabsContext);

      return {
        orientation: context.orientation,
        preferred: computed(() => {
          const value = context.value();

          if (value === null) {
            return [];
          }

          return [value];
        }),
      };
    }),
    OrigamiTabsOptions.provideExisting(() => OrigamiTabs),
  ],
  host: {
    "[attr.data-orientation]": "effectiveOrientation()",
    "[attr.data-disabled]": "disabledAttribute()",
  },
})
export class OrigamiTabs implements OrigamiTabsOptions {
  /**
   * Own selection model, default null; `valueChange` emits user selections written to this model.
   * Replaced Options supply effective selection instead and do not fabricate this output.
   */
  readonly value = model<string | null>(null);
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own orientation input, default `horizontal`; replaced Options supply effective orientation instead. */
  readonly orientation = input<OrigamiTabsOrientation>("horizontal");
  /** Own activation input, default `automatic`; replaced Options supply effective activation instead. */
  readonly activation = input<OrigamiTabsActivation>("automatic");
  /** This root's readonly effective Options observation, shared with its descendants. */
  readonly state = inject(OrigamiTabsState);

  readonly #context = inject(TabsContext);

  /** @internal Effective orientation host marker. */
  protected readonly effectiveOrientation = this.#context.orientation;
  /** @internal Readonly disabled host marker. */
  protected readonly disabledAttribute = this.#context.disabledAttribute;
}
