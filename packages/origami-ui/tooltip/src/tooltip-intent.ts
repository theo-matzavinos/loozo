import type { ɵOrigamiIntent } from "@loozo/origami-ui/popover";
import type { TooltipContext } from "./tooltip";
import { graceArea, insideGraceArea } from "./tooltip-grace";
import type { GracePoint } from "./tooltip-grace";

/** The active grace area, captured when the pointer left the Trigger or Content toward the other. */
type Transit = { readonly polygon: readonly GracePoint[] };

/**
 * Hover, focus and press intent of one Tooltip root. Writes go through the effective `open`
 * Option. Opening is edge-triggered: only a Trigger enter, a keyboard-modality focus or an
 * expiring hover timer opens a closed Tooltip. Leave and blur close only a Tooltip this intent
 * opened. Runs on browser events only.
 */
export class TooltipIntent {
  readonly #context: TooltipContext;
  #hovered = false;
  #contentHovered = false;
  #focused = false;
  /**
   * Set by a `mousedown` on the Trigger until the end of its task. The browser focuses as that
   * `mousedown`'s default action, in the same task, so the next Trigger focus is the press's own.
   * Mouse and pen presses and touch taps send it before the focus they cause; a touch drag sends
   * none. That focus, any Trigger blur or the Trigger's `click` ends it.
   */
  #pointerFocus = false;
  #pointerFocusEnd: ReturnType<typeof setTimeout> | null = null;
  /** The intent this owner's own open produced; any later effective decision replaces it. */
  #opened: ɵOrigamiIntent | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #transit: Transit | null = null;

  constructor(context: TooltipContext) {
    this.#context = context;
  }

  triggerEnter(event: PointerEvent): void {
    if (event.pointerType === "touch") {
      return;
    }

    this.#hovered = true;
    this.#endTransit();

    if (this.#context.desired() || this.#blocked()) {
      return;
    }

    const delay = this.#context.openDelay();

    if (!Number.isFinite(delay) || delay < 0) {
      throw new RangeError("Tooltip open delay must be finite and nonnegative (milliseconds).");
    }

    this.#cancelTimer();

    if (delay === 0) {
      this.#open();

      return;
    }

    this.#timer = setTimeout(() => {
      this.#timer = null;

      if (!this.#context.desired() && !this.#blocked()) {
        this.#open();
      }
    }, delay);
  }

  triggerLeave(element: HTMLElement, event: PointerEvent): void {
    if (event.pointerType === "touch") {
      return;
    }

    this.#hovered = false;
    this.#cancelTimer();
    this.#leave(event, element, this.#context.content());
  }

  contentEnter(event: PointerEvent): void {
    if (event.pointerType === "touch") {
      return;
    }

    this.#contentHovered = true;
    this.#endTransit();
  }

  contentLeave(element: HTMLElement, event: PointerEvent): void {
    if (event.pointerType === "touch") {
      return;
    }

    this.#contentHovered = false;
    this.#leave(event, element, this.#context.trigger());
  }

  /** Any `pointerdown` or `click`, including Enter and Space on a button: closes at once. */
  triggerActivate(): void {
    this.#cancelTimer();

    if (this.#context.desired()) {
      this.#context.request(false);
    }
  }

  /**
   * A `click` also ends a press's focus: every focus a press causes comes before its `click`. A
   * Safari click doesn't focus a button, so a keyboard focus replayed after it in the same task opens.
   */
  triggerClick(): void {
    this.#endPointerFocus();
    this.triggerActivate();
  }

  /**
   * A pointer press keeps the focus it causes from opening, also on an `<input>`, which matches
   * `:focus-visible` on any focus. Replay invokes a replayed `mousedown` and its focus in one
   * task too.
   */
  triggerMouseDown(): void {
    this.#endPointerFocus();
    this.#pointerFocus = true;
    this.#pointerFocusEnd = setTimeout(() => this.#endPointerFocus());
  }

  triggerFocus(element: HTMLElement): void {
    const pointer = this.#pointerFocus;

    this.#endPointerFocus();

    // Only the focused element matches :focus-visible, so a stale or replayed focus of a Trigger
    // that no longer has focus is ignored too.
    if (pointer || !element.matches(":focus-visible") || this.#blocked()) {
      return;
    }

    this.#focused = true;

    if (!this.#context.desired()) {
      this.#open();
    }
  }

  triggerBlur(element: HTMLElement): void {
    // Any blur, stale or not, ends a press's focus: a later focus is a new one.
    this.#endPointerFocus();

    // A stale or replayed blur of a Trigger that has focus again is ignored. The Trigger's own
    // root reports its focus, also inside a shadow root, where the document reports the host.
    const root = element.getRootNode() as Document | ShadowRoot;

    if (root.activeElement === element) {
      return;
    }

    this.#focused = false;

    if (this.#ownsOpen() && !this.#hovered && !this.#contentHovered && this.#transit === null) {
      this.#context.request(false);
    }
  }

  /** Every observed close, whoever wrote it: no pending open or transit survives it. */
  closed(): void {
    this.#cancelTimer();
    this.#endTransit();
  }

  triggerRemoved(): void {
    this.#cancelTimer();
    this.#endTransit();
    this.#endPointerFocus();
    this.#hovered = false;
    this.#focused = false;
  }

  contentRemoved(): void {
    this.#endTransit();
    this.#contentHovered = false;
  }

  #open(): void {
    this.#context.request(true);
    this.#opened = this.#context.intent();
  }

  #ownsOpen(): boolean {
    return this.#opened !== null && this.#context.intent() === this.#opened;
  }

  #blocked(): boolean {
    const trigger = this.#context.trigger();

    return trigger === null || this.#context.disabled() || trigger.matches(":disabled");
  }

  /**
   * A leave closes only a Tooltip this intent opened, and not while focus holds it. It keeps the
   * Tooltip open across the gap toward shown Content (or back), or closes it now.
   */
  #leave(event: PointerEvent, from: HTMLElement, to: HTMLElement | null): void {
    if (!this.#ownsOpen() || this.#focused) {
      return;
    }

    if (to === null || !this.#context.participating()) {
      this.#context.request(false);

      return;
    }

    this.#endTransit();
    this.#transit = {
      polygon: graceArea(
        { x: event.clientX, y: event.clientY },
        from.getBoundingClientRect(),
        to.getBoundingClientRect(),
      ),
    };
    this.#context.layer.document.addEventListener("pointermove", this.#track);
  }

  readonly #track = (event: PointerEvent): void => {
    const transit = this.#transit;

    if (transit === null) {
      return;
    }

    // Entering the Trigger or Content ends the transit in its own enter handler, which runs
    // before this move reaches the document.
    if (insideGraceArea({ x: event.clientX, y: event.clientY }, transit.polygon)) {
      return;
    }

    this.#endTransit();

    if (this.#ownsOpen() && !this.#focused) {
      this.#context.request(false);
    }
  };

  #endTransit(): void {
    if (this.#transit === null) {
      return;
    }

    this.#transit = null;
    this.#context.layer.document.removeEventListener("pointermove", this.#track);
  }

  #endPointerFocus(): void {
    this.#pointerFocus = false;

    if (this.#pointerFocusEnd !== null) {
      clearTimeout(this.#pointerFocusEnd);
      this.#pointerFocusEnd = null;
    }
  }

  #cancelTimer(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }
}
