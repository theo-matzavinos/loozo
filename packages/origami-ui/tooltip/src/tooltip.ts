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
import { ɵOrigamiFloating, ɵOrigamiFloatingScope, ɵOrigamiLayer } from "@loozo/origami-ui/popover";
import type { ɵOrigamiIntent } from "@loozo/origami-ui/popover";
import type {
  OrigamiPresenceState,
  ɵOrigamiPresencePresentation,
} from "@loozo/origami-ui/presence";
import { injectDeferred } from "@loozo/origami-ui/utils";
import type { OrigamiTooltipContentOptions } from "./tooltip-content";
import { TooltipIntent } from "./tooltip-intent";

/** Whole, substitutable root configuration, resolved after construction. */
export abstract class OrigamiTooltipOptions {
  /**
   * Requested open state; direct model default false. Hover and focus intent, Trigger
   * activation, Escape and outside dismissal write it; it isn't native visibility or exit
   * retention.
   */
  abstract readonly open: WritableSignal<boolean>;
  /**
   * Blocks opening by hover and focus, default false. External writes still open the Tooltip,
   * and activation, Escape and outside dismissal still close it.
   */
  abstract readonly disabled: Signal<boolean>;
  /**
   * Hover delay in milliseconds before opening, direct default 600, skipped while the delay
   * group is warm. Keyboard focus opens at once. Read when a hover open is scheduled; a
   * non-finite or negative effective value throws `RangeError` then rather than clamping.
   */
  abstract readonly openDelay: Signal<number>;

  /**
   * Replaces all root Options with an existing compatible provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; supports forward
   *   references.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiTooltipOptions> | AbstractType<OrigamiTooltipOptions>,
  ): Provider {
    return { provide: OrigamiTooltipOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all root Options, without merging unused directive defaults.
   * @param factory - Injection-context factory supplying `open`, `disabled` and `openDelay`.
   *   Ordinary writable signals are valid.
   * @returns A local provider; writes do not fabricate outputs from an unused directive model.
   */
  static provideFactory(factory: () => OrigamiTooltipOptions): Provider {
    return { provide: OrigamiTooltipOptions, useFactory: factory };
  }
}

type TriggerPart = { readonly element: HTMLElement };
type ContentPart = {
  readonly element: HTMLElement;
  readonly options: () => OrigamiTooltipContentOptions;
  readonly presence: OrigamiPresenceState;
  readonly presentation: ɵOrigamiPresencePresentation;
};
type Parts = { readonly trigger: TriggerPart | null; readonly content: ContentPart | null };

/** @internal Nearest logical Tooltip owner. Not exported as an application authoring API. */
@Service({ autoProvided: false })
export class TooltipContext {
  readonly #options = injectDeferred(OrigamiTooltipOptions);
  readonly #trigger = signal<TriggerPart | null>(null);
  readonly #content = signal<ContentPart | null>(null);

  // Object identity detects every effective decision, as Popover's does.
  readonly intent = computed<ɵOrigamiIntent>(() => ({ open: this.#options().open() }));
  readonly desired = computed(() => this.intent().open);
  readonly disabled = computed(() => this.#options().disabled());
  readonly parts = computed<Parts>(() => ({
    trigger: this.#trigger(),
    content: this.#content(),
  }));
  /**
   * Native presentation of Content against the Trigger. Inside Popover Content it presents only
   * while that Popover does; elsewhere it has no presentation parent.
   */
  readonly floating: ɵOrigamiFloating = new ɵOrigamiFloating({
    label: "Tooltip",
    referenceLabel: "Trigger",
    intent: this.intent,
    // Derived from `parts`, so its identity changes exactly when a slot does.
    parts: computed(() => {
      const parts = this.parts();

      return {
        reference: parts.trigger?.element ?? null,
        content: parts.content,
        complete: parts.trigger !== null && parts.content !== null,
      };
    }),
    parent: inject(ɵOrigamiFloatingScope, { optional: true }),
    nextOrder: () => this.layer.nextOrder(),
    closed: (previous) => this.interaction.closed(previous),
  });
  /** Escape order and outside-pointer dismissal as a one-member branch: never a Popover's member. */
  readonly layer: ɵOrigamiLayer = new ɵOrigamiLayer({
    intent: this.intent,
    revision: this.parts,
    dismissible: computed(() => true),
    parent: null,
    floating: this.floating,
    containsTarget: (target) => {
      for (const part of [this.#trigger(), this.#content()]) {
        if (part !== null && (target === part.element || part.element.contains(target))) {
          return true;
        }
      }

      return false;
    },
    // Content is non-interactive and a Tooltip has no branch descendants.
    containsFocus: () => false,
    closeFromInteraction: () => {
      this.floating.closeFromInteraction(() => this.#options().open.set(false));
    },
    restoreFocus: () => {
      // A Tooltip never moves focus.
    },
  });
  /** Hover, focus and press intent; browser events only. */
  readonly interaction: TooltipIntent = new TooltipIntent(this);
  readonly participating = this.floating.participating;
  readonly contentId = computed(() => this.#content()?.options().id() ?? null);

  constructor() {
    // The parts are destroyed with the root, and their removal ends any pending intent work.
    inject(DestroyRef).onDestroy(() => {
      this.interaction.destroyed();
      this.layer.destroy();
      this.floating.destroy();
    });
  }

  /** Registers the Trigger from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerTrigger(part: TriggerPart, destroyRef: DestroyRef): void {
    this.#register(this.#trigger, part, "trigger", destroyRef, () =>
      this.interaction.triggerRemoved(),
    );
  }

  /** Registers Content from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerContent(part: ContentPart, destroyRef: DestroyRef): void {
    this.#register(this.#content, part, "content", destroyRef, () =>
      this.interaction.contentRemoved(),
    );
  }

  /** A hook earlier in the part's view can destroy that view before the part's `ngOnInit` runs. */
  #register<T>(
    slot: WritableSignal<T | null>,
    part: T,
    role: string,
    destroyRef: DestroyRef,
    removed: () => void,
  ): void {
    if (destroyRef.destroyed) {
      return;
    }

    if (slot() !== null) {
      throw new Error(`Tooltip supports only one mounted ${role}.`);
    }

    slot.set(part);
    destroyRef.onDestroy(() => {
      if (slot() === part) {
        this.floating.suppress();
        slot.set(null);
        removed();
        this.floating.schedule();
      }
    });
  }

  /** The registered Trigger's element, or null. */
  trigger(): HTMLElement | null {
    return this.#trigger()?.element ?? null;
  }

  /** The registered Content's element, or null. */
  content(): HTMLElement | null {
    return this.#content()?.element ?? null;
  }

  /** The effective hover delay, unvalidated; its reader validates it. */
  openDelay(): number {
    return this.#options().openDelay();
  }

  /** Writes requested intent through the effective Options. */
  request(open: boolean): void {
    this.#options().open.set(open);
    this.floating.synchronize();
  }
}

/** Nearest root's locally provided readonly facade; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiTooltipState {
  readonly #context = inject(TooltipContext);
  /** Effective requested intent, not native participation, paint readiness or retained exit. Never writable. */
  readonly open: Signal<boolean> = this.#context.desired;
  /** Effective root disabled, which blocks opening by hover and focus only. Never writable. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
}

/**
 * Tooltip owner: one mounted Trigger and one mounted Content, which describes the Trigger.
 * Content is shown in the native top layer next to the Trigger, like Popover Content. Nested
 * roots are independent; parts belong to the nearest root.
 *
 * Hover with a mouse or pen opens it after `openDelay`; keyboard focus (`:focus-visible`) opens
 * it at once and holds it open. Pointer-initiated focus, touch and a natively disabled Trigger
 * never open it, and neither does a disabled root. Opening is edge-triggered: after any close,
 * only a new Trigger enter or a new keyboard focus opens it again. Leaving toward shown Content
 * keeps it open while the pointer stays inside the grace area, the convex hull of the exit point
 * and Content's box; Content itself is hoverable. Leave and blur close only a Tooltip that hover
 * or focus opened; an application-opened one stays open until the application, an activation
 * (`pointerdown` or `click` on the Trigger, including Enter and Space on a button), Escape or an
 * outside gesture closes it. There is no auto-hide timeout.
 *
 * Tooltips in one Angular application form one delay group, with no configuration. While a
 * Tooltip that hover or focus opened is open, and for 300 ms after it closes or is destroyed,
 * hover opens another at once. Opening one by hover or focus closes the other one that hover or
 * focus opened. While one Tooltip's pointer crosses its grace area, another Trigger's hover open
 * waits and happens only if the pointer leaves the area over that Trigger. Application writes
 * neither join nor are affected by the group.
 *
 * Escape closes the most recently natively activated participating Popover or Tooltip, consumes
 * the event and never moves focus. A trusted outside primary gesture closes it; its Trigger and
 * Content count as inside. A Tooltip never joins, vetoes or invalidates a Popover's dismissal
 * branch. A Tooltip whose root is inside Popover Content presents only after that Popover is
 * revealed and is hidden at once, keeping its intent, while that Popover is closed, suppressed or
 * destroyed.
 *
 * SSR emits the Trigger's description and Content with its text and `inert`, without timers,
 * geometry or group state; an initially-open Tooltip activates after its own hydration without
 * an entrance replay. Hover before hydration isn't replayed; a replayed `focus` opens only if the
 * Trigger is still focused and `:focus-visible`.
 *
 * @example
 * ```html
 * <span ogTooltip>
 *   <button type="button" ogTooltipTrigger aria-label="Theme">…</button>
 *   <span ogTooltipContent class="tooltip" [gap]="6">Switch between light and dark</span>
 * </span>
 * ```
 */
@Directive({
  selector: "[ogTooltip]",
  exportAs: "ogTooltip",
  providers: [
    TooltipContext,
    OrigamiTooltipState,
    OrigamiTooltipOptions.provideExisting(() => OrigamiTooltip),
  ],
})
export class OrigamiTooltip implements OrigamiTooltipOptions {
  /** Own requested-state model, default false; `openChange` emits writes to this model. Replaced Options do not emit unused model outputs. */
  readonly open = model(false);
  /** Own boolean-attribute-coerced disabled input, default false. Blocks opening by hover and focus, not external writes or closing. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /**
   * Own hover delay input in milliseconds, default 600. Replaced Options supply the effective
   * value instead. A non-finite or negative effective value throws `RangeError` when a hover
   * open is scheduled.
   */
  readonly openDelay = input(600);
  /** Local readonly facade of effective root Options. */
  readonly state = inject(OrigamiTooltipState);
}
