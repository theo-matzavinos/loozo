import {
  DestroyRef,
  Directive,
  ElementRef,
  Service,
  booleanAttribute,
  computed,
  inject,
  input,
  model,
} from "@angular/core";
import type { Signal } from "@angular/core";
import {
  OrigamiPresence,
  OrigamiPresenceOptions,
  OrigamiPresenceState,
  ɵOrigamiPresencePresentation,
} from "@loozo/origami-ui/presence";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import {
  OrigamiPopoverOptions,
  OrigamiPopoverTriggerOptions,
  OrigamiPopoverAnchorOptions,
  OrigamiPopoverContentOptions,
} from "./options";
import type { OrigamiPopoverSide, OrigamiPopoverAlign } from "./options";
import { PopoverContext } from "./context";

/** Nearest root's locally provided readonly facade; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiPopoverState {
  readonly #context = inject(PopoverContext);
  /** Effective requested intent, not native participation, paint readiness or retained exit. Never writable. */
  readonly open: Signal<boolean> = this.#context.desired;
  /** Effective Trigger-disabled policy; external writes and Escape/outside dismissal are unaffected. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
  /**
   * Readonly effective user-dismissal permission. Own Trigger close bypasses only this owner's
   * flag; a protected requested-open descendant still vetoes the whole branch. Script/model
   * close ignores dismissal permission.
   */
  readonly dismissible: Signal<boolean> = this.#context.dismissible;
}

/** Local readonly observation of Content's composed Presence, not a separate writable alias. */
@Service({ autoProvided: false })
export class OrigamiPopoverContentState {
  readonly #presence = inject(OrigamiPresenceState);
  /** True during preparation, open and finite exit. SSR retains initially-open children; native visibility is separate. */
  readonly open: Signal<boolean> = this.#presence.open;
}

/**
 * Non-modal Popover owner with one mounted Trigger, explicit Anchor and persistent Content.
 * Missing roles or parent suppression hide presentation without erasing requested intent.
 * Descendants use the nearest logical Angular DI owner; unrelated roots can coexist.
 * Consumer roles, names, styling, dimensions, scrolling and animations remain consumer-owned.
 * No focus trap, scroll lock, menu semantics or focus-departure close is supplied.
 *
 * Escape targets the most recently successfully native-activated participating Origami
 * Popover. Already-prevented or composing key events are ignored; a dismissal veto consumes
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
    OrigamiPopoverOptions.ɵprovideDefault(() => OrigamiPopover),
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

/**
 * Native button activation toggles effective intent. `type="button"` prevents form submission;
 * Enter/Space remain native. Requires a nearest Popover owner; duplicate Trigger roles fail.
 * `aria-controls` names only mounted Content and updates with its effective ID.
 * `aria-expanded` observes actual native participation, not requested intent or visible exit.
 * Own Trigger close bypasses its own dismissal veto, never a protected descendant's.
 */
@Directive({
  selector: "button[ogPopoverTrigger]",
  providers: [OrigamiPopoverTriggerOptions.ɵprovideDefault(() => OrigamiPopoverTrigger)],
  host: {
    type: "button",
    "[id]": "effectiveId()",
    "[disabled]": "disabled()",
    "[attr.aria-expanded]": "participating()",
    "[attr.aria-controls]": "contentId()",
    "[attr.aria-disabled]": "disabledAria()",
    "[attr.data-disabled]": "disabledAttribute()",
    "(click)": "activate()",
  },
})
export class OrigamiPopoverTrigger implements OrigamiPopoverTriggerOptions {
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. Static/bound IDs drive default Options; replacements supply the effective ID. */
  readonly id = input(injectUniqueId("popover-trigger"));
  readonly #options = injectDeferred(OrigamiPopoverTriggerOptions);
  readonly #context = inject(PopoverContext);
  #destroyed = false;

  /** @internal Effective host identity from the resolved Options token. */
  protected readonly effectiveId = computed(() => this.#options().id());
  /** @internal Native disabled binding. */
  protected readonly disabled = this.#context.disabled;
  /** @internal Native participation, including transparent preparation but excluding exit. */
  protected readonly participating = this.#context.participating;
  /** @internal Mounted-only Content association. */
  protected readonly contentId = this.#context.contentId;
  /** @internal Disabled ARIA marker. */
  protected readonly disabledAria = computed(() => {
    if (this.disabled()) {
      return "true";
    }

    return null;
  });
  /** @internal Disabled data marker. */
  protected readonly disabledAttribute = computed(() => {
    if (this.disabled()) {
      return "";
    }

    return null;
  });

  /** Registers this role synchronously with caller-scoped cleanup; construction never resolves its own alias. */
  constructor() {
    this.#context.registerTrigger();
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Live native activation; disabled user input cannot write intent. */
  protected activate(): void {
    if (!this.#destroyed) {
      this.#context.activateTrigger();
    }
  }
}

/**
 * Explicit positioning reference, required even when it shares the Trigger's native element.
 * Standalone Anchor uses its own effective ID; co-location uses Trigger Options for the shared ID.
 * Anchor's computed direction and writing mode define placement axes. Requires a nearest root;
 * duplicate mounted Anchor roles fail. No CSS anchor or source association is installed.
 */
@Directive({
  selector: "[ogPopoverAnchor]",
  providers: [OrigamiPopoverAnchorOptions.ɵprovideDefault(() => OrigamiPopoverAnchor)],
  host: { "[id]": "effectiveId()" },
})
export class OrigamiPopoverAnchor implements OrigamiPopoverAnchorOptions {
  /** Own standalone ID input, default a generated opaque hosted identity. Co-located Trigger Options override the shared DOM ID. */
  readonly id = input(injectUniqueId("popover-anchor"));
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #options = injectDeferred(OrigamiPopoverAnchorOptions);
  readonly #context = inject(PopoverContext);
  /** @internal Shared identity resolves from the Trigger token, not the Trigger directive instance. */
  protected readonly effectiveId = computed(() =>
    this.#context.anchorId(this.#element, this.#options),
  );

  /** Registers this independent role with caller-scoped teardown; Trigger/Anchor co-location is valid. */
  constructor() {
    this.#context.registerAnchor();
  }
}

/**
 * Persistent authored-in-place, native manual top-layer Content. Never portaled, cloned or
 * moved from its Angular parent. Requires a nearest root; duplicate Content roles fail.
 * SSR emits the manual attribute and retained initially-open children, but native presentation
 * starts closed and is unavailable until this owner's hydration/activation. Reused SSR hosts
 * and applicable children keep identity; initial settled presence does not replay an entrance.
 *
 * Preparation retains children before `data-entering`, suppresses paint/pointers without
 * suppressing native autofocus, then commits Floating UI coordinates before animation discovery.
 * Preparatory computed opacity/pointer-events are 0/none. Temporary specified-value placeholders
 * and owner-private custom-property names are implementation details, not supported styling hooks;
 * ordinary consumer-authored zero/none values and important priorities remain authoritative.
 *
 * Native participation begins after successful activation, before paint readiness. A canceled
 * show preserves requested intent and retained phase: a new opening stays preparatory `opening`
 * without `data-entering`, while resumed SSR or settled `open` remains open. An unchanged
 * canceled attempt is not retried; later intent, relevant part/configuration or parent
 * presentation changes can request fresh activation. A close before reveal settles without
 * geometry or animation discovery.
 *
 * A current positioning failure, whether during preparation, an update or visible exit, ends
 * native activation immediately without exit retention. It releases temporary paint/pointer
 * suppression and tracking, commits no failed coordinates or reveal, and removes participation
 * and the Trigger's expanded presentation state. The failure itself preserves requested intent
 * and the current Presence phase and reports the error once through Angular's `ErrorHandler`.
 * An unchanged failed attempt is not retried; the same lifecycle changes permit a fresh
 * attempt. A superseded calculation's failure is also reported once but leaves newer
 * presentation untouched.
 *
 * Accepted visible close retains the native top layer but makes Content inert/nonparticipating
 * until finite exit completes. Reopening before native hide preserves promotion order and does
 * not rerun autofocus; reopening inside closing `beforetoggle` needs fresh activation after hide
 * returns. Native events never write the desired model. Consumer callbacks may write effective
 * Options.
 *
 * Consumer CSS owns dimensions, overflow, transforms, z-index, motion and reduced motion;
 * z-index does not reorder native top-layer hosts. Scope custom `display` to `:popover-open` to
 * preserve native closed display; use `gap`, not host margins. No universal fit guarantee or
 * continuous transform-animation tracking is promised.
 * Supported Anchor modes: horizontal-tb, vertical-rl, vertical-lr. Offset then explicit flip
 * candidates use opposite main side, opposite cross alignment, then both, omitting duplicate
 * center candidates. After trying candidates, prefer a main-axis-fitting candidate with less
 * cross-axis overflow; otherwise use least-overflow best fit. This is not an all-four-edge fit
 * guarantee or an always-return-to-requested policy.
 * Document/nested scroll, viewport resize, Anchor/Content resize and observed layout movement
 * are tracked, including visible retained exit while its Anchor remains available. Tracking
 * stops when fully closed, suppressed or destroyed. Obsolete geometry cannot update a destroyed,
 * replacement or newer owner/configuration. Arbitrary unobserved ancestor resize is outside the
 * guarantee. Nested presentation waits for its parent's coordinate/reveal commit.
 *
 * Consumers own role and accessible name. Authored Tab/Shift+Tab order applies: there is no
 * source association, Tab bridge, generic autofocus manager, focus trap or presentation fallback.
 * Do not independently drive native show/hide or replace `popover="manual"`.
 */
@Directive({
  selector: "[ogPopoverContent]",
  exportAs: "ogPopoverContent",
  hostDirectives: [OrigamiPresence],
  providers: [
    ɵOrigamiPresencePresentation,
    OrigamiPopoverContentState,
    OrigamiPopoverContentOptions.ɵprovideDefault(() => OrigamiPopoverContent),
    OrigamiPresenceOptions.provideFactory(() => ({ present: inject(PopoverContext).desired })),
  ],
  host: {
    "[id]": "effectiveId()",
    "[attr.popover]": "'manual'",
    "[attr.inert]": "inactive()",
    "[style.position]": "'fixed'",
    "[style.right]": "'auto'",
    "[style.bottom]": "'auto'",
    "[style.margin]": "'0'",
    "(toggle)": "nativeToggle($event)",
  },
})
export class OrigamiPopoverContent implements OrigamiPopoverContentOptions {
  /** Own ID input, default a generated opaque hosted identity. All effective fields come from resolved replacement Options, not unused defaults. */
  readonly id = input(injectUniqueId("popover-content"));
  /** Own logical side input, default `block-end`; placement axes derive from Anchor computed style. */
  readonly side = input<OrigamiPopoverSide>("block-end");
  /** Own logical cross alignment input, default `start`; center has no edge-alignment suffix. */
  readonly align = input<OrigamiPopoverAlign>("start");
  /**
   * Own main separation input in CSS pixels, default 0; replaced Options supply the effective
   * value instead. Effective values must be finite and nonnegative. Reading invalid effective
   * configuration throws `RangeError` rather than clamping; this is separate from asynchronous
   * positioning failure.
   */
  readonly gap = input(0);
  /** Readonly Presence retention. Not native visibility, root requested state or a public phase alias. */
  readonly state = inject(OrigamiPopoverContentState);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #context = inject(PopoverContext);
  readonly #options = injectDeferred(OrigamiPopoverContentOptions);
  #destroyed = false;
  /** @internal Effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());
  /** @internal Inactive native Content cannot remain a focus target through retained exit. */
  protected readonly inactive = computed(() => {
    if (this.#context.participating()) {
      return null;
    }

    return "";
  });

  /** Registers Content with caller-scoped cleanup; local Presence/Options aliases resolve only after construction. */
  constructor() {
    this.#context.registerContent();
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Consults current native state, never queued toggle intent. Bubbled descendant events are ignored. */
  protected nativeToggle(event: Event): void {
    if (!this.#destroyed && event.target === this.#element) {
      this.#context.nativeToggle(this.#element);
    }
  }
}
