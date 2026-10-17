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
import { injectDeferred } from "@loozo/origami-ui/utils";

/** Collapsed hiding: default ordinary `hidden`; `until-found` progressive native find-to-reveal where supported, ordinary `hidden` elsewhere, no polyfill. */
export type OrigamiCollapsibleHiding = "hidden" | "until-found";

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
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiCollapsibleOptions> | AbstractType<OrigamiCollapsibleOptions>,
  ): Provider {
    return { provide: OrigamiCollapsibleOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all root Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply every required signal.
   * @returns A local provider. Ordinary writable signals do not emit an unused root model's output.
   */
  static provideFactory(factory: () => OrigamiCollapsibleOptions): Provider {
    return { provide: OrigamiCollapsibleOptions, useFactory: factory };
  }
}

type PartRegistration = { readonly options: () => { readonly id: Signal<string> } };

@Service({ autoProvided: false })
export class CollapsibleContext {
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

  /** Registers the Trigger from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerTrigger(options: () => { readonly id: Signal<string> }, destroyRef: DestroyRef): void {
    this.#register(this.#trigger, options, "trigger", destroyRef);
  }

  /** Registers the Panel from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerPanel(options: () => { readonly id: Signal<string> }, destroyRef: DestroyRef): void {
    this.#register(this.#panel, options, "panel", destroyRef);
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

  /** A hook earlier in the part's view can destroy that view before the part's `ngOnInit` runs. */
  #register(
    slot: WritableSignal<PartRegistration | null>,
    options: () => { readonly id: Signal<string> },
    role: "trigger" | "panel",
    destroyRef: DestroyRef,
  ): void {
    if (destroyRef.destroyed) {
      return;
    }

    if (slot() !== null) {
      throw new Error(`Collapsible supports only one mounted ${role}.`);
    }

    const registration: PartRegistration = { options };

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
  readonly expanded: Signal<boolean> = this.#context.expanded;
  /** Effective disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
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
    OrigamiCollapsibleOptions.provideExisting(() => OrigamiCollapsible),
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
