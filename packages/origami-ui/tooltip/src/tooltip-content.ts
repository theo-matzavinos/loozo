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
import { TooltipContext } from "./tooltip";

/** Logical main-side placement, resolved from the Trigger's writing mode and direction. */
export type OrigamiTooltipSide = "block-start" | "block-end" | "inline-start" | "inline-end";

/** Cross-axis logical alignment. `center` has no start/end edge preference. */
export type OrigamiTooltipAlign = "start" | "center" | "end";

/**
 * Whole Content configuration; a replacement supplies all four fields, and defaults on an unused
 * directive never repair an incomplete one. Placement uses the Trigger's axes, not the Content's
 * direction, with Popover Content's flip candidates.
 *
 * @example
 * ```ts
 * OrigamiTooltipContentOptions.provideFactory(() => ({
 *   id: signal("theme-hint"), side: signal<OrigamiTooltipSide>("block-end"),
 *   align: signal<OrigamiTooltipAlign>("end"), gap: signal(6),
 * }));
 * ```
 */
export abstract class OrigamiTooltipContentOptions {
  /** Effective reactive DOM ID; the Trigger's `aria-describedby` follows it while Content is mounted. */
  abstract readonly id: Signal<string>;
  /** Logical main side, direct default `block-start` (above the Trigger in horizontal writing). */
  abstract readonly side: Signal<OrigamiTooltipSide>;
  /** Logical cross alignment, direct default `center`. */
  abstract readonly align: Signal<OrigamiTooltipAlign>;
  /**
   * Main-side separation in CSS pixels, direct default 0. Must be finite and nonnegative;
   * reading invalid effective configuration throws `RangeError` rather than clamping. Use this
   * rather than host margins.
   */
  abstract readonly gap: Signal<number>;

  /**
   * Replaces every Content Option with an existing compatible provider.
   * @param type - Supplier of a compatible concrete or abstract provider class whose instances
   *   supply all four required signals; forward references are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiTooltipContentOptions> | AbstractType<OrigamiTooltipContentOptions>,
  ): Provider {
    return { provide: OrigamiTooltipContentOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces every Content Option, without merging unused directive defaults.
   * @param factory - Runs in injection context; supply `id`, `side`, `align` and finite
   *   nonnegative `gap` signals.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiTooltipContentOptions): Provider {
    return { provide: OrigamiTooltipContentOptions, useFactory: factory };
  }
}

/** Local readonly observation of Content's composed Presence, not a separate writable alias. */
@Service({ autoProvided: false })
export class OrigamiTooltipContentState {
  readonly #presence = inject(OrigamiPresenceState);
  /** True during preparation, open and finite exit. SSR retains initially-open children; native visibility is separate. */
  readonly open: Signal<boolean> = this.#presence.open;
}

/**
 * The Tooltip's text: persistent, authored-in-place native manual top-layer Content, shown next
 * to the Trigger like Popover Content and never portaled, cloned or moved. Static
 * `role="tooltip"` (a consumer's static `role` overrides it), effective `id`, `popover="manual"`,
 * `position: fixed` with `right`, `bottom` and `margin` reset, and `inert` whenever it doesn't
 * participate (closed, exiting, suppressed or preparing). Requires a nearest Tooltip root; a
 * second mounted Content fails clearly when it registers.
 *
 * Keep it outside the Trigger and non-interactive: no focusable descendants and no `autofocus`.
 * Don't gate its text on `state.open()`: the Trigger's description must resolve while it's
 * closed. Mouse or pen hover over shown Content keeps a hover- or focus-opened Tooltip open.
 *
 * Presentation follows Popover Content's: transparent preparation, a guarded coordinate commit
 * and reveal before animation discovery, retained finite exit while inert, reuse of a retained
 * exit reopened before native hide, no participation or retry after a canceled show, and a
 * positioning failure that hides without exit retention and reports once through Angular's
 * `ErrorHandler`, keeping intent. Supported Trigger writing modes: horizontal-tb, vertical-rl,
 * vertical-lr. Consumer CSS owns appearance, dimensions, motion and reduced motion; scope a
 * custom `display` to `:popover-open` and use `gap`, not margins. Opening never moves focus.
 */
@Directive({
  selector: "[ogTooltipContent]",
  exportAs: "ogTooltipContent",
  hostDirectives: [OrigamiPresence],
  providers: [
    ɵOrigamiPresencePresentation,
    OrigamiTooltipContentState,
    OrigamiTooltipContentOptions.provideExisting(() => OrigamiTooltipContent),
    OrigamiPresenceOptions.provideFactory(() => ({ present: inject(TooltipContext).desired })),
  ],
  host: {
    role: "tooltip",
    "[id]": "effectiveId()",
    "[attr.popover]": "'manual'",
    "[attr.inert]": "inactive()",
    "[style.position]": "'fixed'",
    "[style.right]": "'auto'",
    "[style.bottom]": "'auto'",
    "[style.margin]": "'0'",
    "(toggle)": "nativeToggle()",
    "(pointerenter)": "pointerEnter($event)",
    "(pointerleave)": "pointerLeave($event)",
  },
})
export class OrigamiTooltipContent implements OrigamiTooltipContentOptions {
  /** Own ID input, default a generated opaque hosted identity. All effective fields come from resolved replacement Options, not unused defaults. */
  readonly id = input(injectUniqueId("tooltip-content"));
  /** Own logical side input, default `block-start`; placement axes derive from the Trigger's computed style. */
  readonly side = input<OrigamiTooltipSide>("block-start");
  /** Own logical cross alignment input, default `center`. */
  readonly align = input<OrigamiTooltipAlign>("center");
  /**
   * Own main separation input in CSS pixels, default 0; replaced Options supply the effective
   * value instead. Effective values must be finite and nonnegative. Reading invalid effective
   * configuration throws `RangeError` rather than clamping.
   */
  readonly gap = input(0);
  /** Readonly Presence retention. Not native visibility, root requested state or a public phase alias. */
  readonly state = inject(OrigamiTooltipContentState);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #context = inject(TooltipContext);
  readonly #options = injectDeferred(OrigamiTooltipContentOptions);
  readonly #presence = inject(OrigamiPresenceState);
  readonly #presentation = inject(ɵOrigamiPresencePresentation);
  readonly #destroyRef = inject(DestroyRef);
  /** @internal Effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());
  /** @internal Content is hit-testable and focusable only while it participates. */
  protected readonly inactive = computed(() => {
    if (this.#context.participating()) {
      return null;
    }

    return "";
  });

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

  /** @internal Consults current native state, never queued toggle intent. */
  protected nativeToggle(): void {
    this.#context.floating.nativeToggle(this.#element);
  }

  /** @internal Mouse or pen hover over shown Content ends a grace transit. */
  protected pointerEnter(event: PointerEvent): void {
    this.#context.interaction.contentEnter(event);
  }

  /** @internal Leaving shown Content starts a grace transit toward the Trigger, or closes. */
  protected pointerLeave(event: PointerEvent): void {
    this.#context.interaction.contentLeave(this.#element, event);
  }
}
