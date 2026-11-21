import { DestroyRef, Service, computed, inject, signal, untracked } from "@angular/core";
import type { Signal, WritableSignal } from "@angular/core";
import { injectDeferred } from "@loozo/origami-ui/utils";
import {
  clamp,
  normalizedPosition,
  railPoint,
  requestedLength,
  scrollProgress,
  scrollRange,
  thumbTravel,
  toNative,
  wheelForward,
  wheelTarget,
} from "./scroll-area-geometry";
import type { ScrollAreaAxis } from "./scroll-area-geometry";
import { OrigamiScrollAreaOptions } from "./scroll-area-options";

/** A registered part: its element, and whether it has had its first browser render. */
export interface ScrollAreaPart {
  readonly element: HTMLElement;
  /** Set at the part's first browser render; until then the Context neither observes nor reads it. */
  rendered: boolean;
}

/** A Scrollbar: its axis once it registered, and its Thumb slot. */
export interface ScrollAreaScrollbarPart extends ScrollAreaPart {
  /** The axis it registered for; null until it has registered. */
  axis: ScrollAreaAxis | null;
  /** Its registered Thumb, set from the Thumb's `ngOnInit`. */
  thumb: ScrollAreaPart | null;
}

/** One axis's measured geometry, in layout px, kept while its Scrollbar and Thumb are rendered. */
interface AxisCache {
  readonly thumb: HTMLElement;
  /** The track's content box along the axis: its used border-box size minus border and padding. */
  readonly rail: number;
  /** The Thumb's used border-box length along the axis, after the consumer's CSS minimum. */
  readonly length: number;
  readonly travel: number;
  readonly range: number;
  offset: number;
}

/** A live thumb or track drag; it writes only to the Viewport it started on. */
interface Drag {
  readonly viewport: ScrollAreaPart;
  readonly scrollbar: ScrollAreaScrollbarPart;
  readonly thumb: ScrollAreaPart;
  readonly axis: ScrollAreaAxis;
  readonly pointerId: number;
  readonly rtl: boolean;
  /** Where along the thumb the pointer holds it, in layout px from the thumb's start. */
  readonly grab: number;
}

/** A used size (`getComputedStyle`), NaN for a box that isn't rendered. */
function used(value: string): number {
  return Number.parseFloat(value);
}

/**
 * An element's used border-box size along an axis, in layout px: unaffected by ancestor
 * transforms, and fractional. NaN while it isn't rendered (`auto`).
 */
function borderBoxLength(style: CSSStyleDeclaration, axis: ScrollAreaAxis): number {
  if (axis === "y") {
    const size = used(style.height);

    if (style.boxSizing === "border-box") {
      return size;
    }

    return (
      size +
      used(style.paddingTop) +
      used(style.paddingBottom) +
      used(style.borderTopWidth) +
      used(style.borderBottomWidth)
    );
  }

  const size = used(style.width);

  if (style.boxSizing === "border-box") {
    return size;
  }

  return (
    size +
    used(style.paddingLeft) +
    used(style.paddingRight) +
    used(style.borderLeftWidth) +
    used(style.borderRightWidth)
  );
}

/** Border plus padding at the rail's start: its top, its left, or its right for RTL horizontal. */
function startInset(style: CSSStyleDeclaration, axis: ScrollAreaAxis, rtl: boolean): number {
  if (axis === "y") {
    return used(style.borderTopWidth) + used(style.paddingTop);
  }

  if (rtl) {
    return used(style.borderRightWidth) + used(style.paddingRight);
  }

  return used(style.borderLeftWidth) + used(style.paddingLeft);
}

/** Border plus padding on both ends of the axis. */
function insets(style: CSSStyleDeclaration, axis: ScrollAreaAxis): number {
  if (axis === "y") {
    return (
      used(style.borderTopWidth) +
      used(style.paddingTop) +
      used(style.borderBottomWidth) +
      used(style.paddingBottom)
    );
  }

  return (
    used(style.borderLeftWidth) +
    used(style.paddingLeft) +
    used(style.borderRightWidth) +
    used(style.paddingRight)
  );
}

function isRtl(element: HTMLElement): boolean {
  return getComputedStyle(element).direction === "rtl";
}

/** The native scroll position on the axis, as the viewport reports it. */
function nativePosition(element: HTMLElement, axis: ScrollAreaAxis): number {
  if (axis === "y") {
    return element.scrollTop;
  }

  return element.scrollLeft;
}

/**
 * @internal A ScrollArea root's private owner: its registrations, the attached Viewport, the one
 * ResizeObserver and its pending measure frame, the per-axis geometry cache, the overflow and
 * activity signals, the hover flag, the live drag and the hide timer. Provided by each root.
 *
 * Layout is read only in the browser: in a part's first browser render (its hand-off), in the
 * deferred measure frame, and in pointer, wheel and scroll events. Thumb geometry never goes
 * through signals: it is written to the Thumb's inline style.
 */
@Service({ autoProvided: false })
export class ScrollAreaContext {
  readonly #options = injectDeferred(OrigamiScrollAreaOptions);
  readonly #viewport = signal<ScrollAreaPart | null>(null);
  readonly #content = signal<ScrollAreaPart | null>(null);
  readonly #vertical = signal<ScrollAreaScrollbarPart | null>(null);
  readonly #horizontal = signal<ScrollAreaScrollbarPart | null>(null);
  readonly #overflowX = signal(false);
  readonly #overflowY = signal(false);
  readonly #active = signal(false);
  readonly #cache: Record<ScrollAreaAxis, AxisCache | null> = { x: null, y: null };
  /** The Viewport readers use: set at its first browser render, cleared when it is removed. */
  #attached: ScrollAreaPart | null = null;
  /** The attached Viewport's scroll sizes at the last measure, to spot growth on scroll. */
  #scrollWidth = 0;
  #scrollHeight = 0;
  #observer: ResizeObserver | null = null;
  /** The pending measure frame's id, 0 while none is pending. */
  #frame = 0;
  #hovering = false;
  #drag: Drag | null = null;
  #hide: ReturnType<typeof setTimeout> | null = null;
  #destroyed = false;

  /** Measured horizontal overflow; false without an attached Viewport. */
  readonly overflowX: Signal<boolean> = this.#overflowX.asReadonly();
  /** Measured vertical overflow; false without an attached Viewport. */
  readonly overflowY: Signal<boolean> = this.#overflowY.asReadonly();
  /** The visibility policy: hover, a drag or scrolling, until `hideDelay` after the last. */
  readonly active: Signal<boolean> = this.#active.asReadonly();
  /** The Viewport's `overflow-x`: `auto` while a horizontal Scrollbar is registered. */
  readonly viewportOverflowX = computed(() => {
    if (this.#horizontal() !== null) {
      return "auto";
    }

    return "hidden";
  });
  /** The Viewport's `overflow-y`: `auto` while a vertical Scrollbar is registered. */
  readonly viewportOverflowY = computed(() => {
    if (this.#vertical() !== null) {
      return "auto";
    }

    return "hidden";
  });
  /** Whether the Content sizes to its content's width: while a horizontal Scrollbar is registered. */
  readonly contentSized = computed(() => this.#horizontal() !== null);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
      this.#endDrag();

      if (this.#hide !== null) {
        clearTimeout(this.#hide);
        this.#hide = null;
      }

      if (this.#frame !== 0) {
        cancelAnimationFrame(this.#frame);
        this.#frame = 0;
      }

      this.#observer?.disconnect();
      this.#observer = null;
    });
  }

  // -------------------------------------------------------------------------------------------
  // Registration, from each part's `ngOnInit`; removal on its `DestroyRef`

  /** Registers the Viewport; a second mounted one fails. Its removal detaches it and ends its drag. */
  registerViewport(part: ScrollAreaPart, destroyRef: DestroyRef): void {
    this.#register(
      this.#viewport,
      part,
      "ScrollArea supports only one mounted Viewport.",
      destroyRef,
    );
    destroyRef.onDestroy(() => {
      if (this.#attached !== part) {
        return;
      }

      if (this.#drag?.viewport === part) {
        this.#endDrag();
      }

      this.#attached = null;
      this.#observer?.unobserve(part.element);
      this.measure();
    });
  }

  /** Registers the Content; a second mounted one fails. */
  registerContent(part: ScrollAreaPart, destroyRef: DestroyRef): void {
    this.#register(
      this.#content,
      part,
      "ScrollArea supports only one mounted Content.",
      destroyRef,
    );
    destroyRef.onDestroy(() => {
      this.#observer?.unobserve(part.element);
    });
  }

  /**
   * Registers a Scrollbar for its axis; a second one of that orientation fails. Its removal ends a
   * drag on it, unobserves it and its Thumb and drops its axis's geometry.
   */
  registerScrollbar(
    part: ScrollAreaScrollbarPart,
    axis: ScrollAreaAxis,
    destroyRef: DestroyRef,
  ): void {
    let slot = this.#vertical;
    let message = "ScrollArea supports only one vertical Scrollbar.";

    if (axis === "x") {
      slot = this.#horizontal;
      message = "ScrollArea supports only one horizontal Scrollbar.";
    }

    if (!this.#register(slot, part, message, destroyRef)) {
      return;
    }

    part.axis = axis;
    destroyRef.onDestroy(() => {
      if (this.#drag?.scrollbar === part) {
        this.#endDrag();
      }

      this.#observer?.unobserve(part.element);

      if (part.thumb !== null) {
        this.#observer?.unobserve(part.thumb.element);
      }

      this.#cache[axis] = null;
    });
  }

  /**
   * Registers a Thumb in its Scrollbar's slot; a second one fails. Its removal ends a drag on it,
   * unobserves it and drops its axis's geometry.
   */
  registerThumb(
    scrollbar: ScrollAreaScrollbarPart,
    part: ScrollAreaPart,
    destroyRef: DestroyRef,
  ): void {
    if (destroyRef.destroyed) {
      return;
    }

    if (scrollbar.thumb !== null) {
      throw new Error("ScrollArea supports only one Thumb per Scrollbar.");
    }

    scrollbar.thumb = part;
    destroyRef.onDestroy(() => {
      if (scrollbar.thumb !== part) {
        return;
      }

      if (this.#drag?.thumb === part) {
        this.#endDrag();
      }

      scrollbar.thumb = null;
      this.#observer?.unobserve(part.element);

      if (scrollbar.axis !== null && this.#cache[scrollbar.axis]?.thumb === part.element) {
        this.#cache[scrollbar.axis] = null;
      }
    });
  }

  /** Fills an empty slot unless the part's view is already destroyed; a filled slot fails. */
  #register<T extends ScrollAreaPart>(
    slot: WritableSignal<T | null>,
    part: T,
    message: string,
    destroyRef: DestroyRef,
  ): boolean {
    if (destroyRef.destroyed) {
      return false;
    }

    if (untracked(slot) !== null) {
      throw new Error(message);
    }

    slot.set(part);
    destroyRef.onDestroy(() => {
      if (untracked(slot) === part) {
        slot.set(null);
      }
    });

    return true;
  }

  // -------------------------------------------------------------------------------------------
  // Hand-offs: each part's first browser render

  /** The root rendered in the browser: a pointer resting over it through hydration counts as over it. */
  rootRendered(root: HTMLElement): void {
    if (root.matches(":hover")) {
      this.#hovering = true;
      this.#activate();
    }
  }

  /** The Viewport rendered: attach it if it's the registered one, observe it and measure. */
  viewportRendered(part: ScrollAreaPart): void {
    part.rendered = true;

    if (untracked(this.#viewport) !== part) {
      return;
    }

    this.#attached = part;
    this.#observe(part.element);
    this.measure();
  }

  /** The Content or a Scrollbar rendered: observe its content box and measure. */
  partRendered(part: ScrollAreaPart): void {
    part.rendered = true;
    this.#observe(part.element);
    this.measure();
  }

  /** A Thumb rendered: observe its border box (its CSS minimum, border or padding) and measure. */
  thumbRendered(part: ScrollAreaPart): void {
    part.rendered = true;
    this.#observe(part.element, "border-box");
    this.measure();
  }

  #observe(element: HTMLElement, box: ResizeObserverBoxOptions = "content-box"): void {
    if (this.#destroyed) {
      return;
    }

    // A callback only requests the next frame's measure: writing thumb sizes inside it would leave
    // the Thumbs' own notifications undeliverable and raise the ResizeObserver loop error.
    this.#observer ??= new ResizeObserver(() => {
      if (this.#frame !== 0) {
        return;
      }

      this.#frame = requestAnimationFrame(() => {
        this.#frame = 0;
        this.measure();
      });
    });
    this.#observer.observe(element, { box });
  }

  // -------------------------------------------------------------------------------------------
  // Measurement

  /**
   * Reads the attached Viewport's overflow and places each rendered Thumb: requests its length,
   * reads back its used length and writes its offset. Without an attached Viewport, both overflows
   * are false and nothing is written. A pending measure frame is superseded.
   */
  measure(): void {
    if (this.#frame !== 0) {
      cancelAnimationFrame(this.#frame);
      this.#frame = 0;
    }

    if (this.#destroyed) {
      return;
    }

    const viewport = this.#attached;

    if (viewport === null) {
      this.#overflowX.set(false);
      this.#overflowY.set(false);
      this.#cache.x = null;
      this.#cache.y = null;

      return;
    }

    const element = viewport.element;
    const clientWidth = element.clientWidth;
    const clientHeight = element.clientHeight;
    const scrollWidth = element.scrollWidth;
    const scrollHeight = element.scrollHeight;
    const rtl = isRtl(element);

    this.#scrollWidth = scrollWidth;
    this.#scrollHeight = scrollHeight;
    this.#overflowX.set(scrollWidth - clientWidth >= 1);
    this.#overflowY.set(scrollHeight - clientHeight >= 1);

    // Write every axis's requested length first, then read every used length back, so one style
    // and layout flush serves both axes.
    const requested: { axis: ScrollAreaAxis; thumb: HTMLElement; rail: number; range: number }[] =
      [];

    for (const axis of ["y", "x"] as const) {
      this.#cache[axis] = null;

      let scrollbar = untracked(this.#vertical);
      let client = clientHeight;
      let scroll = scrollHeight;

      if (axis === "x") {
        scrollbar = untracked(this.#horizontal);
        client = clientWidth;
        scroll = scrollWidth;
      }

      const thumb = scrollbar?.thumb ?? null;

      if (scrollbar === null || !scrollbar.rendered || thumb === null || !thumb.rendered) {
        continue;
      }

      const trackStyle = getComputedStyle(scrollbar.element);
      const rail = borderBoxLength(trackStyle, axis) - insets(trackStyle, axis);

      if (!Number.isFinite(rail)) {
        continue;
      }

      // The requested length is a border-box length: a `content-box` thumb gets it minus its own
      // border and padding.
      const thumbStyle = getComputedStyle(thumb.element);
      let length = requestedLength(Math.max(0, rail), client, scroll);

      if (thumbStyle.boxSizing !== "border-box") {
        length = Math.max(0, length - insets(thumbStyle, axis));
      }

      if (axis === "y") {
        thumb.element.style.height = `${length}px`;
      } else {
        thumb.element.style.width = `${length}px`;
      }

      requested.push({ axis, thumb: thumb.element, rail, range: scrollRange(scroll, client) });
    }

    for (const { axis, thumb, rail, range } of requested) {
      const length = borderBoxLength(getComputedStyle(thumb), axis);

      if (!Number.isFinite(length)) {
        continue;
      }

      this.#cache[axis] = {
        thumb,
        rail,
        length,
        travel: thumbTravel(rail, length),
        range,
        offset: 0,
      };
      this.#writeOffset(axis, rtl);
    }
  }

  /** Moves an axis's Thumb to the viewport's current position, from the cache. */
  #writeOffset(axis: ScrollAreaAxis, rtl: boolean): void {
    const cache = this.#cache[axis];
    const viewport = this.#attached;

    if (cache === null || viewport === null) {
      return;
    }

    const position = normalizedPosition(axis, rtl, nativePosition(viewport.element, axis));

    cache.offset = cache.travel * scrollProgress(position, cache.range);

    if (axis === "y") {
      cache.thumb.style.transform = `translate3d(0, ${cache.offset}px, 0)`;
    } else if (rtl) {
      cache.thumb.style.transform = `translate3d(${-cache.offset}px, 0, 0)`;
    } else {
      cache.thumb.style.transform = `translate3d(${cache.offset}px, 0, 0)`;
    }
  }

  /** An input reader's first step: a pending measure runs now, so the geometry it reads is current. */
  #flush(): void {
    if (this.#frame !== 0) {
      this.measure();
    }
  }

  // -------------------------------------------------------------------------------------------
  // Visibility

  /** The pointer entered the root: active, and measured (overflow can change without a resize). */
  entered(): void {
    this.#hovering = true;
    this.#activate();
    this.measure();
  }

  /** The pointer left the root: hide after `hideDelay`, unless a drag is live. */
  left(): void {
    this.#hovering = false;
    this.#scheduleHide();
  }

  /** The Viewport scrolled: active, re-measured if its scroll sizes changed, Thumbs moved. */
  scrolled(part: ScrollAreaPart): void {
    if (this.#attached !== part || this.#destroyed) {
      return;
    }

    this.#activate();
    this.#scheduleHide();

    const element = part.element;

    if (element.scrollWidth !== this.#scrollWidth || element.scrollHeight !== this.#scrollHeight) {
      this.measure();

      return;
    }

    const rtl = isRtl(element);

    this.#writeOffset("y", rtl);
    this.#writeOffset("x", rtl);
  }

  #activate(): void {
    if (this.#hide !== null) {
      clearTimeout(this.#hide);
      this.#hide = null;
    }

    this.#active.set(true);
  }

  #scheduleHide(): void {
    if (this.#hovering || this.#drag !== null || this.#destroyed) {
      return;
    }

    if (this.#hide !== null) {
      clearTimeout(this.#hide);
    }

    const delay = untracked(() => this.#options().hideDelay());

    this.#hide = setTimeout(() => {
      this.#hide = null;

      if (!this.#hovering && this.#drag === null) {
        this.#active.set(false);
      }
    }, delay);
  }

  // -------------------------------------------------------------------------------------------
  // Pointer and wheel on a Scrollbar

  /**
   * A press on a Scrollbar. Ignored without an attached Viewport, a cached axis, overflow or
   * travel. Otherwise prevented (no selection or focus change), captured, and a drag starts: from
   * the grab point on the Thumb, or with the Thumb's center jumped to the pointer elsewhere.
   */
  pressed(scrollbar: ScrollAreaScrollbarPart, event: PointerEvent): void {
    if (event.button !== 0 || !event.isPrimary || this.#drag !== null) {
      return;
    }

    this.#flush();

    const viewport = this.#attached;
    const axis = scrollbar.axis;
    const thumb = scrollbar.thumb;

    if (viewport === null || axis === null || thumb === null || !this.#registered(scrollbar)) {
      return;
    }

    const cache = this.#cache[axis];

    if (cache === null || !this.#overflows(axis) || cache.travel <= 0) {
      return;
    }

    const rtl = isRtl(viewport.element);
    const point = this.#railPoint(scrollbar.element, axis, rtl, event);

    if (!Number.isFinite(point)) {
      return;
    }

    event.preventDefault();
    scrollbar.element.setPointerCapture(event.pointerId);

    const onThumb = event.target instanceof Node && thumb.element.contains(event.target);
    let grab = cache.length / 2;

    if (onThumb) {
      grab = point - cache.offset;
    }

    this.#drag = { viewport, scrollbar, thumb, axis, pointerId: event.pointerId, rtl, grab };
    this.#activate();

    if (!onThumb) {
      this.#follow(this.#drag, event);
    }
  }

  /** A move of the drag's pointer. */
  moved(scrollbar: ScrollAreaScrollbarPart, event: PointerEvent): void {
    const drag = this.#drag;

    if (drag === null || drag.scrollbar !== scrollbar || drag.pointerId !== event.pointerId) {
      return;
    }

    this.#follow(drag, event);
  }

  /** The drag's pointer released, canceled or uncaptured. */
  released(scrollbar: ScrollAreaScrollbarPart, event: PointerEvent): void {
    const drag = this.#drag;

    if (drag === null || drag.scrollbar !== scrollbar || drag.pointerId !== event.pointerId) {
      return;
    }

    this.#endDrag();
  }

  /**
   * Scrolls the drag's Viewport so the grab point lands on the pointer. The drag ends instead,
   * writing nothing, once its Viewport, Scrollbar or Thumb is no longer the current one or its axis
   * lost its geometry or travel.
   */
  #follow(drag: Drag, event: PointerEvent): void {
    this.#flush();

    const cache = this.#cache[drag.axis];

    if (
      this.#attached !== drag.viewport ||
      !this.#registered(drag.scrollbar) ||
      drag.scrollbar.thumb !== drag.thumb ||
      cache === null ||
      cache.travel <= 0
    ) {
      this.#endDrag();

      return;
    }

    const point = this.#railPoint(drag.scrollbar.element, drag.axis, drag.rtl, event);
    const progress = clamp((point - drag.grab) / cache.travel, 0, 1);
    const position = progress * cache.range;

    if (!Number.isFinite(position)) {
      this.#endDrag();

      return;
    }

    drag.viewport.element.scrollTo({
      ...toNative(drag.axis, drag.rtl, position),
      behavior: "instant",
    });
  }

  #endDrag(): void {
    const drag = this.#drag;

    if (drag === null) {
      return;
    }

    this.#drag = null;

    const element = drag.scrollbar.element;

    if (element.hasPointerCapture(drag.pointerId)) {
      element.releasePointerCapture(drag.pointerId);
    }

    this.#scheduleHide();
  }

  /**
   * A wheel over a Scrollbar scrolls its axis, with edge chaining: not handled (so the page or an
   * outer scroller takes it) with `ctrlKey`, without an attached Viewport or overflow, or when it
   * moves outward at an edge.
   */
  wheeled(scrollbar: ScrollAreaScrollbarPart, event: WheelEvent): void {
    if (event.ctrlKey) {
      return;
    }

    this.#flush();

    const viewport = this.#attached;
    const axis = scrollbar.axis;

    if (
      viewport === null ||
      axis === null ||
      !this.#registered(scrollbar) ||
      !this.#overflows(axis)
    ) {
      return;
    }

    const element = viewport.element;
    const rtl = isRtl(element);
    let client = element.clientHeight;
    let scroll = element.scrollHeight;

    if (axis === "x") {
      client = element.clientWidth;
      scroll = element.scrollWidth;
    }

    const range = scrollRange(scroll, client);
    const position = normalizedPosition(axis, rtl, nativePosition(element, axis));
    const forward = wheelForward(axis, rtl, event.deltaX, event.deltaY, event.deltaMode, client);
    const target = wheelTarget(position, range, forward);

    if (target === null) {
      return;
    }

    event.preventDefault();
    element.scrollTo({ ...toNative(axis, rtl, target), behavior: "instant" });
  }

  #registered(scrollbar: ScrollAreaScrollbarPart): boolean {
    if (scrollbar.axis === "x") {
      return untracked(this.#horizontal) === scrollbar;
    }

    return untracked(this.#vertical) === scrollbar;
  }

  #overflows(axis: ScrollAreaAxis): boolean {
    if (axis === "x") {
      return untracked(this.#overflowX);
    }

    return untracked(this.#overflowY);
  }

  /** The pointer as layout px along the track's rail, converted through the track's own rect. */
  #railPoint(track: HTMLElement, axis: ScrollAreaAxis, rtl: boolean, event: PointerEvent): number {
    const rect = track.getBoundingClientRect();
    const style = getComputedStyle(track);

    if (axis === "y") {
      return railPoint(
        axis,
        rtl,
        event.clientY,
        { start: rect.top, end: rect.bottom, size: rect.height },
        borderBoxLength(style, axis),
        startInset(style, axis, rtl),
      );
    }

    return railPoint(
      axis,
      rtl,
      event.clientX,
      { start: rect.left, end: rect.right, size: rect.width },
      borderBoxLength(style, axis),
      startInset(style, axis, rtl),
    );
  }
}
