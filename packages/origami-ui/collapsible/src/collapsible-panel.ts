import {
  DestroyRef,
  Directive,
  ElementRef,
  InjectionToken,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import {
  OrigamiPresence,
  OrigamiPresenceOptions,
  OrigamiPresenceState,
} from "@loozo/origami-ui/presence";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { CollapsibleContext } from "./collapsible";

const panelReplacement = new InjectionToken<OrigamiCollapsiblePanelOptions>(
  "Collapsible Panel replacement",
);

/** Effective Panel identity, used by mounted-only Trigger associations. */
export abstract class OrigamiCollapsiblePanelOptions {
  /** Effective DOM ID; the Trigger's `aria-controls` names this ID only while the Panel is mounted. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the Panel's entire effective Options.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references.
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
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiCollapsiblePanelOptions> | AbstractType<OrigamiCollapsiblePanelOptions>,
  ): Provider[] {
    return [
      {
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
      },
    ];
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
  readonly #destroyRef = inject(DestroyRef);
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

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Registers this Panel once Angular has set its inputs; a second mounted Panel fails clearly. */
  ngOnInit(): void {
    this.#context.registerPanel(this.#options, this.#destroyRef);
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
