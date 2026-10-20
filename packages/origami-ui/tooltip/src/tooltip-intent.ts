import { inject } from "@angular/core";
import type { ɵOrigamiIntent } from "@loozo/origami-ui/popover";
import type { TooltipContext } from "./tooltip";
import { TooltipGroup } from "./tooltip-group";
import { graceArea, insideGraceArea } from "./tooltip-grace";
import type { GracePoint } from "./tooltip-grace";

/** The active grace area, captured when the pointer left the Trigger or Content toward the other. */
type Transit = { readonly polygon: readonly GracePoint[] };

/**
 * Hover, focus and press intent of one Tooltip root. Writes go through the effective `open`
 * Option. Opening is edge-triggered: only a Trigger enter, a keyboard-modality focus or an
 * expiring hover timer opens a closed Tooltip. Leave and blur close only a Tooltip this intent
 * opened. Hover and focus opens join the application's delay group. Runs on browser events only.
 * Constructed in its root's injection context.
 */
export class TooltipIntent {
  readonly #context: TooltipContext;
  readonly #group = inject(TooltipGroup);
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
  /** A pending hover open: this timer, or a wait in the group for another Tooltip's transit. */
  #timer: ReturnType<typeof setTimeout> | null = null;
  #transit: Transit | null = null;
  #destroyed = false;

  constructor(context: TooltipContext) {
    this.#context = context;
  }

  triggerEnter(event: PointerEvent): void {
    if (event.pointerType === "touch") {
      return;
    }

    this.#hovered = true;
    this.#endTransit();
    this.#hoverOpen();
  }

  /** The group resumes a hover open that waited for another Tooltip's transit to end. */
  resumeHover(): void {
    this.#hoverOpen();
  }

  #hoverOpen(): void {
    if (this.#context.desired() || this.#blocked()) {
      return;
    }

    const delay = this.#context.openDelay();

    if (!Number.isFinite(delay) || delay < 0) {
      throw new RangeError("Tooltip open delay must be finite and nonnegative (milliseconds).");
    }

    this.#cancelPending();

    if (this.#group.inTransit(this)) {
      this.#group.wait(this);

      return;
    }

    if (delay === 0 || this.#group.warm()) {
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
    this.#cancelPending();
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
    this.#cancelPending();

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

    if (this.ownsOpen() && !this.#hovered && !this.#contentHovered && this.#transit === null) {
      this.#context.request(false);
    }
  }

  /**
   * Every observed close, whoever wrote it: no pending open or transit survives it, and the
   * Tooltips waiting for that transit don't open. `previous` is the decision it replaced; when that
   * was this intent's own open, the group warms, otherwise it drops this Tooltip without warming.
   */
  closed(previous: ɵOrigamiIntent | null): void {
    this.#cancelPending();
    this.#group.closed(this, previous === this.#opened);

    this.#endTransit();
  }

  /** Whether the effective decision is still the one this intent's own open produced. */
  ownsOpen(): boolean {
    return this.#opened !== null && this.#context.intent() === this.#opened;
  }

  /**
   * Whether the application has replaced this intent's own open with an open of its own: the
   * effective decision is open and not this intent's. The group then drops it without warming.
   */
  applicationOpened(): boolean {
    return !this.ownsOpen() && this.#context.desired();
  }

  /** The group closes this intent-opened Tooltip because another one opened by intent. */
  close(): void {
    this.#context.request(false);
  }

  /** The root is destroyed: it leaves the group. Its parts' removal ends its timer and transit. */
  destroyed(): void {
    this.#destroyed = true;
    this.#group.leave(this);
  }

  triggerRemoved(): void {
    this.#cancelPending();
    this.#endTransit();
    this.#endPointerFocus();
    this.#hovered = false;
    this.#focused = false;
  }

  contentRemoved(): void {
    this.#endTransit();
    this.#contentHovered = false;
  }

  /**
   * Writes first, then joins the group, which closes the previous current Tooltip. Its own output
   * can destroy this root or close it again; it then doesn't join.
   */
  #open(): void {
    this.#context.request(true);

    if (this.#destroyed || !this.#context.desired()) {
      return;
    }

    this.#opened = this.#context.intent();
    this.#group.opening(this);
  }

  #blocked(): boolean {
    const trigger = this.#context.trigger();

    return trigger === null || this.#context.disabled() || trigger.matches(":disabled");
  }

  /**
   * A leave closes only a Tooltip this intent opened, and not while focus holds it. It keeps the
   * Tooltip open across the gap toward shown Content (or back), or closes it now. Content isn't
   * shown before it is placed and revealed, and its rect is meaningless until then; a retained
   * visible exit that a reopen reverses stays shown.
   */
  #leave(event: PointerEvent, from: HTMLElement, to: HTMLElement | null): void {
    if (!this.ownsOpen() || this.#focused) {
      return;
    }

    const shown =
      this.#context.participating() && this.#context.parts().content?.presentation.visual();

    if (to === null || !shown) {
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
    this.#group.transitStarted(this);
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

    // Only this end of a transit opens the Tooltips waiting for it; every other end drops them.
    this.#transit = null;
    this.#context.layer.document.removeEventListener("pointermove", this.#track);
    this.#group.transitLeft();

    // A resumed open's output can destroy this root; nothing is written after that.
    if (this.#destroyed) {
      return;
    }

    if (this.ownsOpen() && !this.#focused) {
      this.#context.request(false);
    }
  };

  #endTransit(): void {
    if (this.#transit === null) {
      return;
    }

    this.#transit = null;
    this.#context.layer.document.removeEventListener("pointermove", this.#track);
    this.#group.transitEnded();
  }

  #endPointerFocus(): void {
    this.#pointerFocus = false;

    if (this.#pointerFocusEnd !== null) {
      clearTimeout(this.#pointerFocusEnd);
      this.#pointerFocusEnd = null;
    }
  }

  #cancelPending(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }

    this.#group.stopWaiting(this);
  }
}
