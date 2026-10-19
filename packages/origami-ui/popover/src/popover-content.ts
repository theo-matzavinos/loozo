import {
  DestroyRef,
  Directive,
  ElementRef,
  Service,
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
  ɵOrigamiPresencePresentation,
} from "@loozo/origami-ui/presence";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { ɵOrigamiFloatingScope } from "./floating";
import { PopoverContext } from "./popover";

/** Logical main-side placement, resolved from the Anchor's writing mode and direction. */
export type OrigamiPopoverSide = "block-start" | "block-end" | "inline-start" | "inline-end";

/** Cross-axis logical alignment. `center` has no start/end edge preference. */
export type OrigamiPopoverAlign = "start" | "center" | "end";

/**
 * Whole Content configuration. Former ID-only factories must migrate to all four fields;
 * defaults on an unused directive never repair an incomplete replacement.
 * Placement uses the Anchor's axes, not the Content's direction. Consumer sizing remains owned by CSS.
 *
 * @example
 * ```ts
 * OrigamiPopoverContentOptions.provideFactory(() => ({
 *   id: signal("tasks"), side: signal<OrigamiPopoverSide>("block-end"),
 *   align: signal<OrigamiPopoverAlign>("start"), gap: signal(8),
 * }));
 * ```
 */
export abstract class OrigamiPopoverContentOptions {
  /** Effective reactive DOM ID; mounted-only Trigger `aria-controls` follows it. */
  abstract readonly id: Signal<string>;
  /** Logical main side, direct default `block-end`. Reactively resolved from the Anchor's supported writing mode. */
  abstract readonly side: Signal<OrigamiPopoverSide>;
  /** Logical cross alignment, direct default `start`; `center` has no alignment suffix. */
  abstract readonly align: Signal<OrigamiPopoverAlign>;
  /**
   * Main-side separation in CSS pixels, direct default 0. Must be finite and nonnegative;
   * reading invalid effective configuration throws `RangeError` rather than clamping. This is
   * configuration validation, separate from asynchronous positioning failure. Use this rather
   * than host margins.
   */
  abstract readonly gap: Signal<number>;

  /**
   * Replaces every Content Option with an existing compatible provider.
   * @param type - Supplier of a compatible concrete or abstract provider class whose instances
   *   supply all four required signals; forward references are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiPopoverContentOptions> | AbstractType<OrigamiPopoverContentOptions>,
  ): Provider {
    return { provide: OrigamiPopoverContentOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces every Content Option, including the approved placement fields.
   * @param factory - Runs in injection context; supply `id`, `side`, `align`, and finite nonnegative `gap` signals.
   * @returns A local provider. ID-only factories are not supported.
   */
  static provideFactory(factory: () => OrigamiPopoverContentOptions): Provider {
    return { provide: OrigamiPopoverContentOptions, useFactory: factory };
  }
}

/** Local readonly observation of Content's composed Presence, not a separate writable alias. */
@Service({ autoProvided: false })
export class OrigamiPopoverContentState {
  readonly #presence = inject(OrigamiPresenceState);
  /** True during preparation, open and finite exit. SSR retains initially-open children; native visibility is separate. */
  readonly open: Signal<boolean> = this.#presence.open;
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
    OrigamiPopoverContentOptions.provideExisting(() => OrigamiPopoverContent),
    OrigamiPresenceOptions.provideFactory(() => ({ present: inject(PopoverContext).desired })),
    { provide: ɵOrigamiFloatingScope, useFactory: () => inject(PopoverContext).floating },
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
  readonly #presence = inject(OrigamiPresenceState);
  readonly #presentation = inject(ɵOrigamiPresencePresentation);
  readonly #destroyRef = inject(DestroyRef);
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

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Registers Content once Angular has set its inputs; a second mounted Content fails clearly. */
  ngOnInit(): void {
    this.#context.registerContent(
      {
        element: this.#element,
        options: this.#options,
        presence: this.#presence,
        presentation: this.#presentation,
      },
      this.#destroyRef,
    );
  }

  /** @internal Consults current native state, never queued toggle intent. Bubbled descendant events are ignored. */
  protected nativeToggle(event: Event): void {
    if (!this.#destroyed && event.target === this.#element) {
      this.#context.floating.nativeToggle(this.#element);
    }
  }
}
