import {
  DestroyRef,
  Directive,
  ElementRef,
  InjectionToken,
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
  OrigamiCollection,
  OrigamiCollectionItem,
  OrigamiCollectionItemOptions,
  ɵOrigamiRovingFocus,
} from "@loozo/origami-ui/collection";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";

/** Tabs list axis: `horizontal` uses ArrowLeft/ArrowRight (reading-direction aware), `vertical` uses ArrowUp/ArrowDown. */
export type OrigamiTabsOrientation = "horizontal" | "vertical";

/** `automatic` selects a tab when arrow/Home/End focus reaches it; `manual` moves focus only, and Enter, Space or a click selects. */
export type OrigamiTabsActivation = "automatic" | "manual";

// Module-private so Options retain structural compatibility in packaged declarations.
const tabsReplacement = new InjectionToken<OrigamiTabsOptions>("Tabs replacement");
const triggerReplacement = new InjectionToken<OrigamiTabsTriggerOptions>(
  "Tabs Trigger replacement",
);
const panelReplacement = new InjectionToken<OrigamiTabsPanelOptions>("Tabs Panel replacement");

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
   * @returns Local replacement and public-alias providers. Behavior resolves after construction, independent of direct co-match import order.
   */
  static provideExisting(
    type: () => Type<OrigamiTabsOptions> | AbstractType<OrigamiTabsOptions>,
  ): Provider[] {
    return [
      { provide: tabsReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiTabsOptions, useExisting: tabsReplacement },
    ];
  }

  /**
   * Replaces all Tabs Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply all four required signals.
   * @returns Local replacement and public-alias providers. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiTabsOptions): Provider[] {
    return [
      { provide: tabsReplacement, useFactory: factory },
      { provide: OrigamiTabsOptions, useExisting: tabsReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiTabsOptions> | AbstractType<OrigamiTabsOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiTabsOptions,
        useFactory: () => {
          const replacement = inject(tabsReplacement, {
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
 * Effective Trigger configuration. It also drives the composed Collection Item, so replacing
 * only these Options sets the Trigger's Collection value and order without lower Options.
 */
export abstract class OrigamiTabsTriggerOptions {
  /** The value this Trigger selects and pairs with the Panel of the same value. */
  abstract readonly value: Signal<string>;
  /** Effective DOM ID, named by the mounted Panel's `aria-labelledby`. */
  abstract readonly id: Signal<string>;
  /** Blocks this Trigger's user selection and focus, combined with the root's disabled policy. */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces Trigger Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns Local replacement and public-alias providers; a directly matched Trigger default cannot override this replacement.
   */
  static provideExisting(
    type: () => Type<OrigamiTabsTriggerOptions> | AbstractType<OrigamiTabsTriggerOptions>,
  ): Provider[] {
    return [
      { provide: triggerReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiTabsTriggerOptions, useExisting: triggerReplacement },
    ];
  }

  /**
   * Replaces all Trigger Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value, id and disabled.
   * @returns Local replacement and public-alias providers; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiTabsTriggerOptions): Provider[] {
    return [
      { provide: triggerReplacement, useFactory: factory },
      { provide: OrigamiTabsTriggerOptions, useExisting: triggerReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiTabsTriggerOptions> | AbstractType<OrigamiTabsTriggerOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiTabsTriggerOptions,
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

/** Effective Panel configuration, used for visibility and mounted-only associations. */
export abstract class OrigamiTabsPanelOptions {
  /** The value whose selection shows this Panel and whose Trigger labels it. */
  abstract readonly value: Signal<string>;
  /** Effective DOM ID, named by the mounted Trigger's `aria-controls`. */
  abstract readonly id: Signal<string>;

  /**
   * Replaces Panel Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references.
   * @returns Local replacement and public-alias providers; a directly matched Panel default cannot override this replacement.
   */
  static provideExisting(
    type: () => Type<OrigamiTabsPanelOptions> | AbstractType<OrigamiTabsPanelOptions>,
  ): Provider[] {
    return [
      { provide: panelReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiTabsPanelOptions, useExisting: panelReplacement },
    ];
  }

  /**
   * Replaces all Panel Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value and id.
   * @returns Local replacement and public-alias providers; defaults on an unused directive cannot repair missing Options.
   */
  static provideFactory(factory: () => OrigamiTabsPanelOptions): Provider[] {
    return [
      { provide: panelReplacement, useFactory: factory },
      { provide: OrigamiTabsPanelOptions, useExisting: panelReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiTabsPanelOptions> | AbstractType<OrigamiTabsPanelOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiTabsPanelOptions,
        useFactory: () => {
          const replacement = inject(panelReplacement, {
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

type PartRegistration = {
  readonly options: () => { readonly value: Signal<string>; readonly id: Signal<string> };
};

@Service({ autoProvided: false })
class TabsContext {
  readonly #options = injectDeferred(OrigamiTabsOptions);
  readonly #triggers = signal<readonly PartRegistration[]>([]);
  readonly #panels = signal<readonly PartRegistration[]>([]);
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
  }

  registerTrigger(): void {
    this.#register(this.#triggers, injectDeferred(OrigamiTabsTriggerOptions));
  }

  registerPanel(): void {
    this.#register(this.#panels, injectDeferred(OrigamiTabsPanelOptions));
  }

  /** ID of the first mounted Trigger with `value`, or null. */
  triggerId(value: string): string | null {
    return this.#idOf(this.#triggers(), value);
  }

  /** ID of the first mounted Panel with `value`, or null. */
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

  #idOf(registrations: readonly PartRegistration[], value: string): string | null {
    for (const registration of registrations) {
      const options = registration.options();

      if (options.value() === value) {
        return options.id();
      }
    }

    return null;
  }

  #register(
    slot: WritableSignal<readonly PartRegistration[]>,
    options: PartRegistration["options"],
  ): void {
    const registration: PartRegistration = { options };
    const destroyRef = inject(DestroyRef);

    slot.update((registrations) => [...registrations, registration]);
    destroyRef.onDestroy(() => {
      const remaining: PartRegistration[] = [];

      for (const mounted of slot()) {
        if (mounted !== registration) {
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
 * Angular DI, composing Collection so focus follows rendered DOM order. While the value is null
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
  hostDirectives: [OrigamiCollection],
  providers: [
    TabsContext,
    OrigamiTabsState,
    ɵOrigamiRovingFocus,
    OrigamiTabsOptions.ɵprovideDefault(() => OrigamiTabs),
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

/**
 * The Triggers' container: static `role="tablist"` and `aria-orientation` from effective
 * Options. The consumer supplies its accessible name with `aria-label` or `aria-labelledby`.
 * Requires a nearest Tabs root.
 */
@Directive({
  selector: "[ogTabsList]",
  host: {
    role: "tablist",
    "[attr.aria-orientation]": "orientation()",
  },
})
export class OrigamiTabsList {
  /** @internal Effective `aria-orientation`. */
  protected readonly orientation = inject(TabsContext).orientation;
}

/**
 * A native `type="button"` with `role="tab"`, composed with Collection Item. Click, Enter or
 * Space focuses it and selects its value once if it is still mounted and enabled after its focus
 * handlers ran; selecting the selected tab writes nothing and there is no deselection. Arrow keys along the effective orientation (horizontal arrows follow
 * reading direction), Home and End move focus among enabled Triggers in DOM order, wrapping at
 * the ends; with automatic activation the Trigger a move focuses is selected if it is still
 * mounted, enabled and focused after its focus handlers ran. Other focus never selects. One
 * enabled Trigger is the tab stop (`tabindex="0"`): the focused one, else the first selected,
 * else the first. Root or own disabled state sets native `disabled`, `aria-disabled` and
 * `data-disabled` and removes the Trigger from navigation; a disabled selected Trigger stays
 * `aria-selected`. `aria-controls` names only a mounted Panel of the same value. If a focused
 * Trigger is removed or disabled while focus has not moved elsewhere, focus moves to the new
 * tab stop without selecting. Requires a nearest Tabs root; values should be distinct within it.
 */
@Directive({
  selector: "button[ogTabsTrigger]",
  hostDirectives: [OrigamiCollectionItem],
  providers: [
    OrigamiTabsTriggerOptions.ɵprovideDefault(() => OrigamiTabsTrigger),
    OrigamiCollectionItemOptions.provideFactory(() => inject(OrigamiTabsTriggerOptions)),
  ],
  host: {
    role: "tab",
    type: "button",
    "[id]": "effectiveId()",
    "[disabled]": "effectiveDisabled()",
    "[attr.tabindex]": "tabIndex()",
    "[attr.aria-selected]": "selected()",
    "[attr.aria-controls]": "panelId()",
    "[attr.aria-disabled]": "disabledAria()",
    "[attr.data-selected]": "selectedAttribute()",
    "[attr.data-disabled]": "disabledAttribute()",
    "(click)": "activate()",
    "(keydown)": "keydown($event)",
    "(focus)": "focused()",
    "(blur)": "blurred()",
  },
})
export class OrigamiTabsTrigger implements OrigamiTabsTriggerOptions {
  /**
   * Own value input, default opaque generated identity that pairs with nothing; give each
   * Trigger and its Panel the same explicit value. Replaced Options supply the effective value.
   */
  readonly value = input(injectUniqueId("tabs-trigger-value"));
  /** Own ID input, default opaque hydration-stable generated identity; replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("tabs-trigger"));
  /** Own disabled input, default false with boolean-attribute coercion; combined with the root's disabled policy. */
  readonly disabled = input(false, { transform: booleanAttribute });

  readonly #options = injectDeferred(OrigamiTabsTriggerOptions);
  readonly #context = inject(TabsContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  #destroyed = false;

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());
  /** @internal Combined root and own disabled policy. */
  protected readonly effectiveDisabled = computed(
    () => this.#context.disabled() || this.#options().disabled(),
  );
  /** @internal Selection ARIA observation, always `true` or `false`. */
  protected readonly selected = computed(() => this.#context.value() === this.#options().value());
  /** @internal Mounted-only control association. */
  protected readonly panelId = computed(() => this.#context.panelId(this.#options().value()));

  readonly #focus = inject(ɵOrigamiRovingFocus).register({
    disabled: this.effectiveDisabled,
    preferred: this.selected,
    navigated: () => {
      if (this.#context.activation() === "automatic" && this.#selectable()) {
        this.#context.select(this.#options().value());
      }
    },
  });

  /** @internal Roving tab stop. */
  protected readonly tabIndex = computed(() => {
    if (this.#focus.tabStop()) {
      return "0";
    }

    return "-1";
  });

  /** @internal Disabled ARIA observation. */
  protected readonly disabledAria = computed(() => {
    if (this.effectiveDisabled()) {
      return "true";
    }

    return null;
  });

  /** @internal Selected host marker. */
  protected readonly selectedAttribute = computed(() => {
    if (this.selected()) {
      return "";
    }

    return null;
  });

  /** @internal Disabled host marker. */
  protected readonly disabledAttribute = computed(() => {
    if (this.effectiveDisabled()) {
      return "";
    }

    return null;
  });

  /** Registers this Trigger synchronously with caller-scoped teardown; an orphan fails Angular DI clearly. */
  constructor() {
    this.#context.registerTrigger();
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /**
   * @internal Live native activation request, obeying effective disabled Options. Not every
   * engine focuses a clicked button, so activation focuses this Trigger to make it the roving
   * position; that focus never selects. Its focus handlers may remove or disable this Trigger,
   * so the guard runs again once focus returns.
   */
  protected activate(): void {
    if (!this.#selectable()) {
      return;
    }

    this.#element.focus();

    if (!this.#selectable()) {
      return;
    }

    this.#context.select(this.#options().value());
  }

  /** @internal Arrow/Home/End navigation along the effective orientation. */
  protected keydown(event: KeyboardEvent): void {
    this.#focus.keydown(event, this.#context.orientation());
  }

  /** @internal Focus tracking for the roving tab stop. */
  protected focused(): void {
    this.#focus.focus();
  }

  /** @internal Focus tracking for the roving tab stop. */
  protected blurred(): void {
    this.#focus.blur();
  }

  /** Live activation guard: mounted and not disabled by the root or its own Options. */
  #selectable(): boolean {
    return !this.#destroyed && !this.effectiveDisabled();
  }
}

/**
 * Static `role="tabpanel"` content for the Trigger of the same value. It is `hidden` unless
 * its value is the root value, whether or not a Trigger with that value is mounted, and
 * carries `data-selected` while shown. `aria-labelledby` names only
 * a mounted Trigger of the same value. A static `tabindex="0"` makes the Panel a tab stop for
 * content without focusable children; a consumer's static `tabindex` overrides it. Panels have
 * no enter/exit Presence: gate heavy content with the root's State. Requires a nearest Tabs root.
 */
@Directive({
  selector: "[ogTabsPanel]",
  providers: [OrigamiTabsPanelOptions.ɵprovideDefault(() => OrigamiTabsPanel)],
  host: {
    role: "tabpanel",
    tabindex: "0",
    "[id]": "effectiveId()",
    "[attr.aria-labelledby]": "triggerId()",
    "[attr.hidden]": "hiddenAttribute()",
    "[attr.data-selected]": "selectedAttribute()",
  },
})
export class OrigamiTabsPanel implements OrigamiTabsPanelOptions {
  /**
   * Own value input, default opaque generated identity that pairs with nothing; give each
   * Panel its Trigger's explicit value. Replaced Options supply the effective value.
   */
  readonly value = input(injectUniqueId("tabs-panel-value"));
  /** Own ID input, default opaque hydration-stable generated identity; replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("tabs-panel"));

  readonly #options = injectDeferred(OrigamiTabsPanelOptions);
  readonly #context = inject(TabsContext);
  readonly #selected = computed(() => this.#context.value() === this.#options().value());

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());
  /** @internal Mounted-only labelling association. */
  protected readonly triggerId = computed(() => this.#context.triggerId(this.#options().value()));

  /** @internal Hidden unless selected. */
  protected readonly hiddenAttribute = computed(() => {
    if (this.#selected()) {
      return null;
    }

    return "";
  });

  /** @internal Selected host marker. */
  protected readonly selectedAttribute = computed(() => {
    if (this.#selected()) {
      return "";
    }

    return null;
  });

  /** Registers this Panel synchronously with caller-scoped teardown; an orphan fails Angular DI clearly. */
  constructor() {
    this.#context.registerPanel();
  }
}
