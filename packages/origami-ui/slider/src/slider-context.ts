import { DestroyRef, Service, computed, effect, inject, signal, untracked } from "@angular/core";
import type { WritableSignal } from "@angular/core";
import { EventPhase } from "@angular/core/primitives/event-dispatch";
import { FORM_FIELD } from "@angular/forms/signals";
import type { FieldState } from "@angular/forms/signals";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { Subject } from "rxjs";
import {
  fraction,
  gridValue,
  lastValue,
  nearestValue,
  pageDistance,
  renderedValue,
  sliderGrid,
  valueAbove,
  valueBelow,
} from "./slider-math";
import type { SliderGrid } from "./slider-math";
import { OrigamiSliderOptions } from "./slider-options";

/** A registered Track or Thumb. */
export interface SliderPart {
  readonly element: HTMLElement;
}

/** A live pointer drag, captured on the Track that took the press. */
interface SliderGesture {
  readonly track: SliderPart;
  readonly pointerId: number;
  /** The press's distance from the value's position, kept while dragging; 0 on the Track. */
  readonly offset: number;
  /** The Track's computed direction at the press. */
  readonly rtl: boolean;
}

type SliderKeyAction = "next" | "previous" | "pageUp" | "pageDown" | "first" | "last";

/**
 * Whether Angular is replaying an event that reached the server-rendered element before it
 * hydrated: from the early event contract (`EventPhase.REPLAY`) or from a deferred block's queue
 * (`Event.NONE`). A live listener always sees capturing, at-target or bubbling; `isTrusted` can't
 * tell them apart. The event's default already happened and can't be prevented, and the pointer
 * it came from may have moved or been released since.
 */
function replayed(event: Event): boolean {
  return event.eventPhase === EventPhase.REPLAY || event.eventPhase === Event.NONE;
}

/** Prevents a live event's default; a replayed one's already happened. */
function prevent(event: Event): void {
  if (!replayed(event)) {
    event.preventDefault();
  }
}

function rtl(element: HTMLElement): boolean {
  return getComputedStyle(element).direction === "rtl";
}

/** The action of a Slider key; ArrowLeft and ArrowRight swap in right-to-left text. */
function keyAction(key: string, thumb: HTMLElement): SliderKeyAction | null {
  switch (key) {
    case "ArrowUp":
      return "next";
    case "ArrowDown":
      return "previous";
    case "ArrowRight":
    case "ArrowLeft":
      if ((key === "ArrowRight") !== rtl(thumb)) {
        return "next";
      }

      return "previous";
    case "PageUp":
      return "pageUp";
    case "PageDown":
      return "pageDown";
    case "Home":
      return "first";
    case "End":
      return "last";
  }

  return null;
}

/** The allowed value a key moves to from the rendered value, or null when none lies that way. */
function keyTarget(action: SliderKeyAction, grid: SliderGrid, current: number): number | null {
  switch (action) {
    case "next":
      return valueAbove(grid, current);
    case "previous":
      return valueBelow(grid, current);
    case "first":
      return gridValue(grid, 0);
    case "last":
      return lastValue(grid);
  }

  if (action === "pageUp") {
    const target = nearestValue(grid, current + pageDistance(grid));

    if (target > current) {
      return target;
    }

    return null;
  }

  const target = nearestValue(grid, current - pageDistance(grid));

  if (target < current) {
    return target;
  }

  return null;
}

/**
 * @internal The Slider's private owner: the effective range, the registered Track and Thumb, the
 * live drag and the guarded user write. It also owns the root's Signal Forms binding (`FORM_FIELD`
 * on the root's element), whose readonly state drops user writes and which the Thumb's Field
 * membership reads.
 */
@Service({ autoProvided: false })
export class SliderContext {
  readonly #options = injectDeferred(OrigamiSliderOptions);
  readonly #binding = inject(FORM_FIELD, { self: true, optional: true });
  readonly #touches = new Subject<void>();
  readonly #track = signal<SliderPart | null>(null);
  readonly #thumb = signal<SliderPart | null>(null);
  readonly #gesture = signal<SliderGesture | null>(null);
  #destroyed = false;

  readonly value = computed(() => this.#options().value());
  readonly min = computed(() => this.#options().min() ?? 0);
  readonly max = computed(() => this.#options().max() ?? 100);
  readonly disabled = computed(() => this.#options().disabled());
  readonly #grid = computed(() => sliderGrid(this.min(), this.max(), this.#options().step()));
  /** Whether a user write would apply: enabled, not form-readonly and a valid configuration. */
  readonly #writable = computed(() => {
    const formReadonly = this.#binding?.state().readonly() ?? false;

    return !this.disabled() && !formReadonly && this.#grid() !== null;
  });
  /** `aria-valuenow`: the value clamped to the range; under an invalid configuration, as it is. */
  readonly now = computed(() => {
    const grid = this.#grid();

    if (grid === null) {
      return this.value();
    }

    return renderedValue(grid, this.value());
  });
  /** The clamped value's position in the range, 0–100; 0 under an invalid configuration. */
  readonly percent = computed(() => {
    const grid = this.#grid();

    if (grid === null) {
      return 0;
    }

    return fraction(grid, this.value()) * 100;
  });
  /** A live drag holds the Track's pointer capture while user writes apply. */
  readonly dragging = computed(() => this.#gesture() !== null && this.#writable());
  /** Emits synchronously when focus leaves the Thumb; only `OrigamiSlider` reports it. */
  readonly touches = this.#touches.asObservable();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
      this.#end();
    });
    // Becoming disabled, readonly or invalid ends a drag at the first change detection; moves
    // check the policy themselves. A change reverted before either isn't observed.
    effect(() => {
      if (this.#gesture() !== null && !this.#writable()) {
        untracked(() => this.#end());
      }
    });
  }

  /** Registers the Track from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerTrack(part: SliderPart, destroyRef: DestroyRef): void {
    this.#register(this.#track, part, "track", destroyRef);
  }

  /** Registers the Thumb from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerThumb(part: SliderPart, destroyRef: DestroyRef): void {
    this.#register(this.#thumb, part, "thumb", destroyRef);
  }

  /** A hook earlier in the part's view can destroy that view before the part's `ngOnInit` runs. */
  #register(
    slot: WritableSignal<SliderPart | null>,
    part: SliderPart,
    role: string,
    destroyRef: DestroyRef,
  ): void {
    if (destroyRef.destroyed) {
      return;
    }

    if (slot() !== null) {
      throw new Error(`Slider supports only one mounted ${role}.`);
    }

    slot.set(part);
    destroyRef.onDestroy(() => {
      if (slot() === part) {
        slot.set(null);
        // A drag never outlives the Track it captured on or the Thumb it moves.
        this.#end();
      }
    });
  }

  /**
   * The Signal Forms state bound on the root's element, or null without `[formField]`; read only
   * after the parts' `ngOnInit`, once Angular has set that binding.
   */
  formState(): FieldState<unknown> | null {
    return this.#binding?.state() ?? null;
  }

  /** Focuses the registered Thumb; nothing while none is registered or while disabled. */
  focus(options?: FocusOptions): void {
    if (this.disabled()) {
      return;
    }

    this.#thumb()?.element.focus(options);
  }

  /** Focus left the Thumb. */
  left(): void {
    this.#touches.next();
  }

  /**
   * A key on the Thumb. Handled keys prevent their default, also when they write nothing: at a
   * bound, while readonly or under an invalid configuration. A replayed key is applied once.
   */
  keydown(event: KeyboardEvent, thumb: HTMLElement): void {
    if (
      this.#destroyed ||
      this.disabled() ||
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }

    const action = keyAction(event.key, thumb);

    if (action === null) {
      return;
    }

    prevent(event);

    const grid = this.#grid();

    if (grid === null) {
      return;
    }

    const target = keyTarget(action, grid, renderedValue(grid, this.value()));

    if (target !== null) {
      this.#write(target);
    }
  }

  /**
   * A press on a Track. A live primary press focuses the Thumb and, while writes apply, captures
   * the pointer for a drag; on the Track it moves the value to the pointer, on the Thumb it keeps
   * the grab offset. A replayed press is applied once, without a drag: it focuses the Thumb and
   * moves the value to the press point unless it was on the Thumb.
   */
  press(event: PointerEvent, track: SliderPart): void {
    if (
      this.#destroyed ||
      this.#track() !== track ||
      this.disabled() ||
      event.button !== 0 ||
      !event.isPrimary
    ) {
      return;
    }

    const live = !replayed(event);

    if (live) {
      event.preventDefault();
    }

    const thumb = this.#thumb();
    const target = event.target;
    const onThumb = thumb !== null && target instanceof Node && thumb.element.contains(target);

    thumb?.element.focus({ preventScroll: true });

    // Focus listeners run synchronously: Options signals and form state they write are read here,
    // while bindings and views they change apply only at the next change detection.
    if (this.#destroyed || this.#track() !== track || !this.#writable()) {
      return;
    }

    const direction = rtl(track.element);

    if (!live) {
      if (!onThumb) {
        this.#write(this.#pointerValue(event.clientX, track, direction));
      }

      return;
    }

    let offset = 0;

    if (onThumb) {
      offset = event.clientX - this.#anchor(track, direction);
    }

    track.element.setPointerCapture(event.pointerId);
    this.#gesture.set({ track, pointerId: event.pointerId, offset, rtl: direction });

    if (!onThumb) {
      this.#write(this.#pointerValue(event.clientX, track, direction));
    }
  }

  /** A pointer move over or captured by a Track: the drag's pointer writes the nearest allowed value. */
  move(event: PointerEvent, track: SliderPart): void {
    const gesture = this.#gesture();

    if (
      replayed(event) ||
      gesture === null ||
      gesture.track !== track ||
      gesture.pointerId !== event.pointerId
    ) {
      return;
    }

    if (this.#destroyed || !this.#writable()) {
      this.#end();

      return;
    }

    this.#write(this.#pointerValue(event.clientX - gesture.offset, track, gesture.rtl));
  }

  /** `pointerup`, `pointercancel` or `lostpointercapture` on a Track: the drag's pointer ends it. */
  release(event: PointerEvent, track: SliderPart): void {
    const gesture = this.#gesture();

    if (
      replayed(event) ||
      gesture === null ||
      gesture.track !== track ||
      gesture.pointerId !== event.pointerId
    ) {
      return;
    }

    this.#end();
  }

  #end(): void {
    const gesture = this.#gesture();

    if (gesture === null) {
      return;
    }

    this.#gesture.set(null);

    if (gesture.track.element.hasPointerCapture(gesture.pointerId)) {
      gesture.track.element.releasePointerCapture(gesture.pointerId);
    }
  }

  /** The current value's position on the Track, in client pixels from the viewport's left. */
  #anchor(track: SliderPart, rtl: boolean): number {
    const rect = track.element.getBoundingClientRect();
    const grid = this.#grid();
    let position = 0;

    if (grid !== null) {
      position = fraction(grid, this.value());
    }

    if (rtl) {
      return rect.right - position * rect.width;
    }

    return rect.left + position * rect.width;
  }

  /** The allowed value nearest to a client x over the Track's border box, read now. */
  #pointerValue(x: number, track: SliderPart, rtl: boolean): number | null {
    const grid = this.#grid();
    const rect = track.element.getBoundingClientRect();

    if (grid === null || rect.width <= 0) {
      return null;
    }

    let position = (x - rect.left) / rect.width;

    if (rtl) {
      position = 1 - position;
    }

    return nearestValue(grid, grid.min + position * (grid.max - grid.min));
  }

  /**
   * A user write: dropped after destruction, while disabled, while the root's `[formField]` is
   * readonly and under an invalid configuration, and when it equals the current value.
   */
  #write(value: number | null): void {
    if (value === null || this.#destroyed || !this.#writable()) {
      return;
    }

    const options = this.#options();

    if (options.value() === value) {
      return;
    }

    options.value.set(value);
  }
}
