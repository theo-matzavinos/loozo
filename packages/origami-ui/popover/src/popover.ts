import {
  DestroyRef,
  Directive,
  PLATFORM_ID,
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
import { isPlatformServer } from "@angular/common";
import { OrigamiPresenceState, ɵOrigamiPresencePresentation } from "@loozo/origami-ui/presence";
import { injectDeferred, ɵOrigamiLayer } from "@loozo/origami-ui/utils";
import type { ɵOrigamiIntent } from "@loozo/origami-ui/utils";
import { ɵOrigamiFloating } from "./floating";
import type { OrigamiPopoverAnchorOptions } from "./popover-anchor";
import type { OrigamiPopoverContentOptions } from "./popover-content";
import type { OrigamiPopoverTriggerOptions } from "./popover-trigger";

/** Whole, substitutable root configuration, resolved after construction. */
export abstract class OrigamiPopoverOptions {
  /** Requested open state, writable by behavior; direct model default false. Not native visibility or exit retention. */
  abstract readonly open: WritableSignal<boolean>;
  /** Prevents Trigger activation, default false. External writes and dismissal remain authoritative. */
  abstract readonly disabled: Signal<boolean>;
  /**
   * User branch-dismissal permission, direct default true. The owner's own Trigger may bypass
   * only this owner's flag; any protected requested-open descendant still vetoes the whole
   * branch without partial writes. Script/model close ignores this permission.
   */
  abstract readonly dismissible: Signal<boolean>;

  /**
   * Replaces all root Options with an existing compatible provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; supports forward
   *   references.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiPopoverOptions> | AbstractType<OrigamiPopoverOptions>,
  ): Provider {
    return { provide: OrigamiPopoverOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all root Options, without merging unused directive defaults.
   * @param factory - Injection-context factory supplying every required signal. Ordinary writable signals are valid.
   * @returns A local provider; writes do not fabricate outputs from an unused directive model.
   */
  static provideFactory(factory: () => OrigamiPopoverOptions): Provider {
    return { provide: OrigamiPopoverOptions, useFactory: factory };
  }
}

type Policy = { readonly disabled: boolean; readonly dismissible: boolean };
type IdentityPart = {
  readonly element: HTMLElement;
  readonly options: () => { readonly id: Signal<string> };
};
type TriggerPart = {
  readonly element: HTMLElement;
  readonly options: () => OrigamiPopoverTriggerOptions;
};
type ContentPart = {
  readonly element: HTMLElement;
  readonly options: () => OrigamiPopoverContentOptions;
  readonly presence: OrigamiPresenceState;
  readonly presentation: ɵOrigamiPresencePresentation;
};
type Parts = {
  readonly trigger: TriggerPart | null;
  readonly anchor: IdentityPart | null;
  readonly content: ContentPart | null;
};

/** @internal Nearest logical Popover owner. Not exported as an application authoring API. */
@Service({ autoProvided: false })
export class PopoverContext {
  readonly #parent = inject(PopoverContext, { optional: true, skipSelf: true });
  readonly #server = isPlatformServer(inject(PLATFORM_ID));
  readonly #options = injectDeferred(OrigamiPopoverOptions);
  readonly #trigger = signal<TriggerPart | null>(null);
  readonly #anchor = signal<IdentityPart | null>(null);
  readonly #content = signal<ContentPart | null>(null);
  #destroyed = false;

  // Object identity detects invalidated/recomputed effective signal decisions, including
  // net-equal close/reopen before a pointer snapshot's next observation.
  readonly intent = computed<ɵOrigamiIntent>(() => ({ open: this.#options().open() }));
  readonly #policy = computed<Policy>(() => ({
    disabled: this.#options().disabled(),
    dismissible: this.#options().dismissible(),
  }));
  readonly desired = computed(() => this.intent().open);
  readonly disabled = computed(() => this.#policy().disabled);
  readonly dismissible = computed(() => this.#policy().dismissible);
  readonly parts = computed<Parts>(() => ({
    trigger: this.#trigger(),
    anchor: this.#anchor(),
    content: this.#content(),
  }));
  /** Native presentation of Content against the Anchor, nested under the parent Popover's. */
  readonly floating: ɵOrigamiFloating = new ɵOrigamiFloating({
    label: "Popover",
    referenceLabel: "Anchor",
    intent: this.intent,
    // Derived from `parts`, so its identity changes exactly when a slot does.
    parts: computed(() => {
      const parts = this.parts();

      return {
        reference: parts.anchor?.element ?? null,
        content: parts.content,
        complete: parts.trigger !== null && parts.anchor !== null && parts.content !== null,
      };
    }),
    parent: this.#parent?.floating ?? null,
    nextOrder: () => this.layer.nextOrder(),
    closed: (previous, interaction) => {
      const focus = this.layer.document.activeElement;
      const restore = previous?.open === true && !interaction && this.layer.containsFocus(focus);

      // Restore only the owning closing trigger, never each suppressed descendant.
      if (restore && !this.#server) {
        this.#restoreFocus(focus);
      }
    },
  });
  /** Escape order and outside-pointer dismissal; a nested Popover joins its parent Popover's branch. */
  readonly layer: ɵOrigamiLayer = new ɵOrigamiLayer({
    intent: this.intent,
    // Its identity changes exactly when parts or policy does: a captured branch must still match both.
    revision: computed(() => ({ parts: this.parts(), policy: this.#policy() })),
    dismissible: this.dismissible,
    parent: this.#parent?.layer ?? null,
    presentation: this.floating,
    containsTarget: (target) => {
      for (const part of [this.#trigger(), this.#anchor(), this.#content()]) {
        if (part !== null && (target === part.element || part.element.contains(target))) {
          return true;
        }
      }

      return false;
    },
    containsFocus: (focus) => {
      const content = this.#content();

      return content !== null && content.element.contains(focus);
    },
    closeFromInteraction: () => {
      this.floating.closeFromInteraction(() => this.#options().open.set(false));
    },
    restoreFocus: (expectedFocus) => this.#restoreFocus(expectedFocus),
  });
  readonly participating = this.floating.participating;
  readonly contentId = computed(() => this.#content()?.options().id() ?? null);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
      this.layer.destroy();
      this.floating.destroy();
    });
  }

  /** Registers the Trigger from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerTrigger(part: TriggerPart, destroyRef: DestroyRef): void {
    this.#register(this.#trigger, part, "trigger", destroyRef);
  }

  /** Registers the Anchor from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerAnchor(part: IdentityPart, destroyRef: DestroyRef): void {
    this.#register(this.#anchor, part, "anchor", destroyRef);
  }

  /** Registers Content from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerContent(part: ContentPart, destroyRef: DestroyRef): void {
    this.#register(this.#content, part, "content", destroyRef);
  }

  /** A hook earlier in the part's view can destroy that view before the part's `ngOnInit` runs. */
  #register<T>(
    slot: WritableSignal<T | null>,
    part: T,
    role: string,
    destroyRef: DestroyRef,
  ): void {
    if (destroyRef.destroyed) {
      return;
    }

    if (slot() !== null) {
      throw new Error(`Popover supports only one mounted ${role}.`);
    }

    slot.set(part);
    destroyRef.onDestroy(() => {
      if (slot() === part) {
        this.floating.suppress();
        slot.set(null);
        this.floating.schedule();
      }
    });
  }

  anchorId(element: HTMLElement, options: () => OrigamiPopoverAnchorOptions): string {
    const trigger = this.#trigger();

    if (trigger !== null && trigger.element === element) {
      return trigger.options().id();
    }

    return options().id();
  }

  activateTrigger(): void {
    if (this.#destroyed || this.disabled()) {
      return;
    }

    if (this.desired()) {
      this.layer.dismiss("trigger", true);
    } else {
      this.#options().open.set(true);
      this.floating.synchronize();
    }
  }

  #restoreFocus(expectedFocus: Element | null): void {
    const trigger = this.#trigger();

    if (
      this.#destroyed ||
      trigger === null ||
      this.disabled() ||
      trigger.options().disabled() ||
      !trigger.element.isConnected ||
      trigger.element.matches(":disabled") ||
      trigger.element.closest("[inert]") !== null ||
      this.layer.document.activeElement !== expectedFocus
    ) {
      return;
    }

    trigger.element.focus();
  }
}

/** Nearest root's locally provided readonly facade; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiPopoverState {
  readonly #context = inject(PopoverContext);
  /** Effective requested intent, not native participation, paint readiness or retained exit. Never writable. */
  readonly open: Signal<boolean> = this.#context.desired;
  /** Effective root disabled policy, which disables the Trigger; the Trigger's own disabled isn't included. External writes and Escape/outside dismissal are unaffected. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
  /**
   * Readonly effective user-dismissal permission. Own Trigger close bypasses only this owner's
   * flag; a protected requested-open descendant still vetoes the whole branch. Script/model
   * close ignores dismissal permission.
   */
  readonly dismissible: Signal<boolean> = this.#context.dismissible;
}

/**
 * Non-modal Popover owner with one mounted Trigger, explicit Anchor and persistent Content.
 * Missing roles or parent suppression hide presentation without erasing requested intent.
 * Descendants use the nearest logical Angular DI owner; unrelated roots can coexist.
 * Consumer roles, names, styling, dimensions, scrolling and animations remain consumer-owned.
 * No focus trap, scroll lock, menu semantics or focus-departure close is supplied.
 *
 * Escape targets the most recently successfully native-activated participating Origami
 * Popover or Tooltip. Already-prevented or composing key events are ignored; a dismissal veto consumes
 * the request without falling through to an ancestor or another root. Coordinate updates
 * and reopening a retained exit before native hide do not change that promotion order.
 *
 * Outside dismissal requires trusted primary-button down and matching up outside the affected
 * branch; nested descendants count as inside their ancestors. Inside-to-outside drags,
 * prevented events, mismatched pointer/button, and cancellation or capture loss before matching
 * pointerup invalidate the gesture. Matching pointerup ends acquisition: later cancellation or
 * capture loss does not veto completion. Dismissal runs after pointerup dispatch finishes so
 * later listeners can still prevent that up event, and only if the captured branch remains
 * current.
 *
 * A user close requires every requested-open branch member's permission. The owner's own
 * Trigger bypasses only its own flag. Veto performs no writes or outputs; accepted branch
 * writes proceed descendant before ancestor. Synchronous listeners may change or replace the
 * branch; remaining stale operations do not overwrite the new decision. Script/model close
 * is authoritative and suppresses descendants without clearing their requested intent.
 *
 * Escape restores the relevant live eligible Trigger once. Outside dismissal preserves outside
 * focus. Script close restores focus only when it remains inside the closing branch; suppressing
 * nested focused content restores the closing owner's Trigger once. Never restore a
 * disconnected, destroyed, disabled or inert Trigger, or steal focus moved elsewhere by a
 * listener.
 *
 * @example
 * ```html
 * <div ogPopover [(open)]="open">
 *   <button ogPopoverTrigger ogPopoverAnchor>Choose task</button>
 *   <section ogPopoverContent #content="ogPopoverContent" role="group" aria-label="Tasks" [gap]="8">
 *     @if (content.state.open()) { <button>Consumer-owned task</button> }
 *   </section>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogPopover]",
  exportAs: "ogPopover",
  providers: [
    PopoverContext,
    OrigamiPopoverState,
    OrigamiPopoverOptions.provideExisting(() => OrigamiPopover),
  ],
})
export class OrigamiPopover implements OrigamiPopoverOptions {
  /** Own requested-state model, default false; `openChange` emits accepted writes to this model. Replaced Options do not emit unused model outputs. */
  readonly open = model(false);
  /** Own boolean-attribute-coerced disabled input, default false. Blocks user Trigger activation, not authoritative writes or dismissal. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /**
   * Own boolean-attribute-coerced user-dismissal input, default true. Replaced Options drive
   * effective policy. Own Trigger close bypasses only this owner's flag; a protected
   * requested-open descendant vetoes the whole branch. Script/model close is authoritative.
   */
  readonly dismissible = input(true, { transform: booleanAttribute });
  /** Local readonly facade of effective root Options. */
  readonly state = inject(OrigamiPopoverState);
}
