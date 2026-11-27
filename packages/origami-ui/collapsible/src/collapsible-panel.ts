import {
  DestroyRef,
  Directive,
  ElementRef,
  Renderer2,
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

/** Effective Panel identity, used by mounted-only Trigger associations. */
export abstract class OrigamiCollapsiblePanelOptions {
  /** Effective DOM ID; the Trigger's `aria-controls` names this ID only while the Panel is mounted. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the Panel's entire effective Options.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiCollapsiblePanelOptions> | AbstractType<OrigamiCollapsiblePanelOptions>,
  ): Provider {
    return { provide: OrigamiCollapsiblePanelOptions, useExisting: forwardRef(type) };
  }

  /**
   * Substitutes reactive Panel identity.
   * @param factory - Runs in injection context and supplies the required `id` signal.
   * @returns A local provider; defaults on an unused directive cannot repair missing Options.
   */
  static provideFactory(factory: () => OrigamiCollapsiblePanelOptions): Provider {
    return { provide: OrigamiCollapsiblePanelOptions, useFactory: factory };
  }
}

/**
 * Whether no validation candidate before `control` in its form's `elements` is currently invalid,
 * or `control` has no form owner. Validating a form dispatches `invalid` on each invalid control
 * in tree order, then the browser focuses the first one it can, so only that control's Panels open.
 */
function isFirstInvalidControl(control: Element): boolean {
  if (!("form" in control) || !(control.form instanceof HTMLFormElement)) {
    return true;
  }

  for (const element of control.form.elements) {
    if (element === control) {
      return true;
    }

    const isInvalid =
      "willValidate" in element &&
      element.willValidate === true &&
      "validity" in element &&
      element.validity instanceof ValidityState &&
      !element.validity.valid;

    if (isInvalid) {
      return false;
    }
  }

  return true;
}

/**
 * Composes Presence and remains unhidden through finite exit, hiding only once closed.
 * `data-expanded` observes desired expansion. `aria-labelledby` names only the mounted
 * Trigger. `until-found` uses native reveal where supported, otherwise ordinary hidden;
 * enabled `beforematch` requests expansion idempotently. Disabled collapsed Panels use
 * ordinary hidden to prevent the platform's non-cancelable reveal. A trusted `invalid` on a
 * descendant control that is its form's first invalid control requests expansion in either hiding
 * mode and, when granted, applies its own `hidden` change at once so the browser can focus the
 * control. Requires a nearest root owner.
 * Consumers supply any region role, heading hierarchy, content semantics and motion CSS.
 */
@Directive({
  selector: "[ogCollapsiblePanel]",
  exportAs: "ogCollapsiblePanel",
  hostDirectives: [OrigamiPresence],
  providers: [
    OrigamiCollapsiblePanelOptions.provideExisting(() => OrigamiCollapsiblePanel),
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
  /**
   * This Panel's readonly exit retention, from its composed Presence: `state.open()` stays true
   * through a finite exit, so consumers gate content on it.
   */
  readonly state = inject(OrigamiPresenceState);

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
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
    if (this.state.open()) {
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
    // `invalid` doesn't bubble, so a descendant control's reaches the Panel only in capture.
    const stopInvalid = inject(Renderer2).listen(
      this.#host,
      "invalid",
      (event: Event) => this.#invalid(event),
      { capture: true },
    );

    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
      stopInvalid();
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

  /**
   * A descendant control failed validation. When it is its form's first invalid control, request
   * expansion and, once granted, apply this Panel's `hidden` change at once: the browser focuses the
   * control right after this event, before Angular renders.
   */
  #invalid(event: Event): void {
    const control = event.target;

    const isDescendantControl =
      event.isTrusted && control instanceof Element && control !== this.#host;

    if (this.#destroyed || !isDescendantControl || !isFirstInvalidControl(control)) {
      return;
    }

    const wasHidden = this.hidden() !== null;

    this.#context.reveal();

    // A synchronous expansion output may have destroyed this Panel.
    if (this.#destroyed) {
      return;
    }

    // A synchronous output listener or replaced Options may have refused the expansion.
    const isGranted = this.#context.expanded();
    // Reading the binding's value also makes Presence observe the open intent, so if the Panel
    // collapses again before Angular renders, the binding still passes through `null` and then
    // writes its collapsed value.
    const isShown = this.hidden() === null;

    if (!wasHidden || !isGranted || !isShown) {
      return;
    }

    // The browser focuses the control right after this event, before Angular renders: apply this
    // Panel's own binding change now, as the render would, and leave any other `hidden` binding
    // on the host to its owner.
    this.#host.removeAttribute("hidden");
    // WebKit decides whether former until-found content is focusable from its last layout.
    this.#host.getBoundingClientRect();
  }
}
