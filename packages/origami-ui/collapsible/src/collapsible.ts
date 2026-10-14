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
  OrigamiPresence,
  OrigamiPresenceOptions,
  OrigamiPresenceState,
} from "@loozo/origami-ui/presence";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";

/** Collapsed hiding: default ordinary `hidden`; `until-found` progressive native find-to-reveal where supported, ordinary `hidden` elsewhere, no polyfill. */
export type OrigamiCollapsibleHiding = "hidden" | "until-found";

const collapsibleReplacement = new InjectionToken<OrigamiCollapsibleOptions>(
  "Collapsible replacement",
);
const triggerReplacement = new InjectionToken<OrigamiCollapsibleTriggerOptions>(
  "Collapsible Trigger replacement",
);
const panelReplacement = new InjectionToken<OrigamiCollapsiblePanelOptions>(
  "Collapsible Panel replacement",
);

/** Effective root configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiCollapsibleOptions {
  /** Writable expanded intent; the direct root model defaults to false. External writes remain authoritative. */
  abstract readonly expanded: WritableSignal<boolean>;
  /** Blocks user activation and native reveal requests, not external configuration writes; default false. */
  abstract readonly disabled: Signal<boolean>;
  /** Collapsed hiding policy, default `hidden`; `until-found` is a progressive enhancement without a polyfill. */
  abstract readonly hiding: Signal<OrigamiCollapsibleHiding>;

  /**
   * Replaces root Options with an existing compatible concrete or abstract provider.
   * @param type - Deferred provider class, allowing forward references and host-directive composition.
   * @returns Local replacement and public-alias providers. Behavior resolves after construction, independent of direct co-match import order.
   */
  static provideExisting(
    type: () => Type<OrigamiCollapsibleOptions> | AbstractType<OrigamiCollapsibleOptions>,
  ): Provider[] {
    return [
      { provide: collapsibleReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiCollapsibleOptions, useExisting: collapsibleReplacement },
    ];
  }

  /**
   * Replaces all root Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply every required signal.
   * @returns Local replacement and public-alias providers. Ordinary writable signals do not emit an unused root model's output.
   */
  static provideFactory(factory: () => OrigamiCollapsibleOptions): Provider[] {
    return [
      { provide: collapsibleReplacement, useFactory: factory },
      { provide: OrigamiCollapsibleOptions, useExisting: collapsibleReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A local provider preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiCollapsibleOptions> | AbstractType<OrigamiCollapsibleOptions>,
  ): Provider {
    return {
      provide: OrigamiCollapsibleOptions,
      useFactory: () => {
        const replacement = inject(collapsibleReplacement, {
          optional: true,
          self: true,
        });

        if (replacement !== null) {
          return replacement;
        }

        return inject(forwardRef(type));
      },
    };
  }
}

/** Effective Trigger identity; independent of its generated default and reactive when replaced. */
export abstract class OrigamiCollapsibleTriggerOptions {
  /** Effective DOM ID, authoritative for the mounted Panel's `aria-labelledby`. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the Trigger's entire effective Options.
   * @param type - Compatible concrete or abstract provider class, resolved through a forward reference.
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
   * @returns A local provider preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () =>
      | Type<OrigamiCollapsibleTriggerOptions>
      | AbstractType<OrigamiCollapsibleTriggerOptions>,
  ): Provider {
    return {
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
    };
  }
}

/** Effective Panel identity, used by mounted-only Trigger associations. */
export abstract class OrigamiCollapsiblePanelOptions {
  /** Effective DOM ID; the Trigger's `aria-controls` names this ID only while the Panel is mounted. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the Panel's entire effective Options.
   * @param type - Compatible concrete or abstract provider class, allowing forward references.
   * @returns Local replacement and public-alias providers; a directly matched Panel default cannot override this replacement.
   */
  static provideExisting(
    type: () => Type<OrigamiCollapsiblePanelOptions> | AbstractType<OrigamiCollapsiblePanelOptions>,
  ): Provider[] {
    return [
      { provide: panelReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiCollapsiblePanelOptions, useExisting: panelReplacement },
    ];
  }

  /**
   * Substitutes reactive Panel identity.
   * @param factory - Runs in injection context and supplies the required `id` signal.
   * @returns Local replacement and public-alias providers; defaults on an unused directive cannot repair missing Options.
   */
  static provideFactory(factory: () => OrigamiCollapsiblePanelOptions): Provider[] {
    return [
      { provide: panelReplacement, useFactory: factory },
      { provide: OrigamiCollapsiblePanelOptions, useExisting: panelReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A local provider preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiCollapsiblePanelOptions> | AbstractType<OrigamiCollapsiblePanelOptions>,
  ): Provider {
    return {
      provide: OrigamiCollapsiblePanelOptions,
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
    };
  }
}

type PartRegistration = { readonly options: () => { readonly id: Signal<string> } };

@Service({ autoProvided: false })
class CollapsibleContext {
  readonly #options = injectDeferred(OrigamiCollapsibleOptions);
  readonly #trigger = signal<PartRegistration | null>(null);
  readonly #panel = signal<PartRegistration | null>(null);
  #destroyed = false;

  readonly expanded = computed(() => this.#options().expanded());
  readonly disabled = computed(() => this.#options().disabled());
  readonly hiding = computed(() => this.#options().hiding());
  readonly triggerId = computed(() => this.#trigger()?.options().id() ?? null);
  readonly panelId = computed(() => this.#panel()?.options().id() ?? null);

  readonly expandedAttribute = computed(() => {
    if (this.expanded()) {
      return "";
    }

    return null;
  });

  readonly disabledAttribute = computed(() => {
    if (this.disabled()) {
      return "";
    }

    return null;
  });

  readonly disabledAria = computed(() => {
    if (this.disabled()) {
      return "true";
    }

    return null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  registerTrigger(): void {
    this.#register(this.#trigger, injectDeferred(OrigamiCollapsibleTriggerOptions), "trigger");
  }

  registerPanel(): void {
    this.#register(this.#panel, injectDeferred(OrigamiCollapsiblePanelOptions), "panel");
  }

  toggle(): void {
    if (this.#destroyed || this.disabled()) {
      return;
    }

    this.#options().expanded.set(!this.expanded());
  }

  reveal(): void {
    if (this.#destroyed || this.disabled() || this.expanded()) {
      return;
    }

    this.#options().expanded.set(true);
  }

  #register(
    slot: WritableSignal<PartRegistration | null>,
    options: () => { readonly id: Signal<string> },
    role: "trigger" | "panel",
  ): void {
    if (slot() !== null) {
      throw new Error(`Collapsible supports only one mounted ${role}.`);
    }

    const registration: PartRegistration = { options };
    const destroyRef = inject(DestroyRef);

    slot.set(registration);
    destroyRef.onDestroy(() => {
      if (slot() === registration) {
        slot.set(null);
      }
    });
  }
}

/** Locally provided readonly facade for the nearest Collapsible; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiCollapsibleState {
  readonly #context = inject(CollapsibleContext);

  /** Effective desired expansion, not Presence's exit retention. No writable mutation alias is exposed. */
  readonly expanded: Signal<boolean> = computed(() => this.#context.expanded());
  /** Effective disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = computed(() => this.#context.disabled());
}

/**
 * Owns one optional Trigger and one optional Panel through nearest logical Angular DI.
 * Duplicate mounted roles fail clearly; teardown removes only the destroyed registration.
 * Root `data-expanded`/`data-disabled` reflect effective substituted Options.
 * Consumers own headings, content roles, accessible names, styling and animation.
 */
@Directive({
  selector: "[ogCollapsible]",
  exportAs: "ogCollapsible",
  providers: [
    CollapsibleContext,
    OrigamiCollapsibleState,
    OrigamiCollapsibleOptions.ɵprovideDefault(() => OrigamiCollapsible),
  ],
  host: {
    "[attr.data-expanded]": "expandedAttribute()",
    "[attr.data-disabled]": "disabledAttribute()",
  },
})
export class OrigamiCollapsible implements OrigamiCollapsibleOptions {
  /**
   * Own expansion model, default false; `expandedChange` emits writes to this model.
   * Replaced Options supply effective expansion instead and do not fabricate this output.
   */
  readonly expanded = model(false);
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own hiding input, default `hidden`; replaced Options supply effective policy. Unsupported `until-found` uses ordinary hidden. */
  readonly hiding = input<OrigamiCollapsibleHiding>("hidden");
  /** Nearest root's readonly effective Options observation. */
  readonly state = inject(OrigamiCollapsibleState);

  readonly #context = inject(CollapsibleContext);

  /** @internal Readonly desired-expansion host marker. */
  protected readonly expandedAttribute = this.#context.expandedAttribute;
  /** @internal Readonly disabled host marker. */
  protected readonly disabledAttribute = this.#context.disabledAttribute;
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
    this.#context.registerTrigger();
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

/**
 * Composes Presence and remains unhidden through finite exit, hiding only once closed.
 * `data-expanded` observes desired expansion. `aria-labelledby` names only the mounted
 * Trigger. `until-found` uses native reveal where supported, otherwise ordinary hidden;
 * enabled `beforematch` requests expansion idempotently. Disabled collapsed Panels use
 * ordinary hidden to prevent the platform's non-cancelable reveal. Requires a nearest root owner.
 * Consumers supply any region role, heading hierarchy, content semantics and motion CSS.
 */
@Directive({
  selector: "[ogCollapsiblePanel]",
  exportAs: "ogCollapsiblePanel",
  hostDirectives: [OrigamiPresence],
  providers: [
    OrigamiCollapsiblePanelOptions.ɵprovideDefault(() => OrigamiCollapsiblePanel),
    OrigamiPresenceOptions.provideFactory(() => ({ present: inject(CollapsibleContext).expanded })),
  ],
  host: {
    "[id]": "effectiveId()",
    "[attr.aria-labelledby]": "triggerId()",
    "[attr.data-expanded]": "expandedAttribute()",
    "[attr.hidden]": "hidden()",
    "(beforematch)": "beforeMatch($event)",
  },
})
export class OrigamiCollapsiblePanel implements OrigamiCollapsiblePanelOptions {
  /** Own ID input, default opaque generated identity. Static/bound IDs drive default Options; substituted ID signals drive replacement Options. */
  readonly id = input(injectUniqueId("collapsible-panel"));

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #presence = inject(OrigamiPresenceState);
  readonly #supportsReveal = "onbeforematch" in this.#host;
  #destroyed = false;

  readonly #options = injectDeferred(OrigamiCollapsiblePanelOptions);
  readonly #context = inject(CollapsibleContext);

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());
  /** @internal Mounted-only labelling association. */
  protected readonly triggerId = this.#context.triggerId;
  /** @internal Desired expanded marker. */
  protected readonly expandedAttribute = this.#context.expandedAttribute;
  /** @internal Effective collapsed hiding after Presence retention completes. */
  protected readonly hidden = computed(() => {
    if (this.#presence.open()) {
      return null;
    }

    // Native beforematch is not cancelable and removes until-found after dispatch.
    // Disabled collapsed content must use ordinary hidden to prevent native revelation.
    if (
      this.#context.hiding() === "until-found" &&
      this.#supportsReveal &&
      !this.#context.disabled()
    ) {
      return "until-found";
    }

    return "";
  });

  /** Registers this Panel synchronously; unmount cleanup cannot remove a replacement registration. */
  constructor() {
    this.#context.registerPanel();
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Own live native reveal request; bubbled descendant events are not this Panel's request. */
  protected beforeMatch(event: Event): void {
    if (this.#destroyed || event.target !== this.#host) {
      return;
    }

    if (this.#context.hiding() === "until-found" && this.#supportsReveal) {
      this.#context.reveal();
    }
  }
}
