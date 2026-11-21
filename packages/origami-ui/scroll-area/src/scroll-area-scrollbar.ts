import {
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  untracked,
} from "@angular/core";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { ScrollAreaContext } from "./scroll-area-context";
import type { ScrollAreaScrollbarPart } from "./scroll-area-context";
import type { OrigamiScrollAreaOrientation } from "./scroll-area-orientation";
import { ScrollAreaScrollbarContext } from "./scroll-area-scrollbar-context";
import { OrigamiScrollAreaScrollbarOptions } from "./scroll-area-scrollbar-options";

/**
 * A drawn scrollbar track for one axis of the nearest ScrollArea root, holding an
 * `[ogScrollAreaThumb]`. One per orientation; a second of the same orientation fails when it
 * registers. Changing a mounted Scrollbar's `orientation` isn't supported.
 *
 * Host semantics: `data-orientation`; empty `data-visible` while the root is active (hover, a
 * drag, scrolling, until `hideDelay` after the last) and its axis overflows, absent otherwise and
 * in server HTML; static `aria-hidden="true"`, since the Viewport itself is the keyboard and
 * assistive-technology surface. Position it over the Viewport's edge with your CSS, and hide it
 * with `visibility` (not only `opacity`) while it has no `data-visible`, so it doesn't take
 * clicks.
 *
 * Pointer: a primary press on the Thumb drags it from where it was grabbed; a press elsewhere on
 * the track jumps the Thumb's center to the pointer and continues as a drag. Both capture the
 * pointer and are prevented, so they select no text and don't move focus. Every move scrolls the
 * Viewport the drag started on, with `behavior: "instant"`. The drag ends on `pointerup`,
 * `pointercancel` or `lostpointercapture`, and when its Viewport, this Scrollbar, its Thumb or the
 * root is removed. Nothing is handled without an attached Viewport, a rendered Thumb, overflow on
 * the axis, or room for the Thumb to move. Give it `touch-action: none` for touch and pen.
 *
 * Wheel: a wheel over it scrolls its axis (a horizontal track also takes a vertical wheel, toward
 * the inline end), and isn't handled at an edge it moves away from, with `ctrlKey`, or without an
 * attached Viewport or overflow, so the page or an outer scroller takes it. Line deltas count
 * 16 px, page deltas the Viewport's size.
 *
 * Its listeners are added with `addEventListener` after its first browser render, so Origami adds
 * no `jsaction`, and nothing pressed before hydration is replayed.
 */
@Directive({
  selector: "[ogScrollAreaScrollbar]",
  providers: [
    OrigamiScrollAreaScrollbarOptions.provideExisting(() => OrigamiScrollAreaScrollbar),
    ScrollAreaScrollbarContext,
  ],
  host: {
    "aria-hidden": "true",
    "[attr.data-orientation]": "orientationAttribute()",
    "[attr.data-visible]": "visibleAttribute()",
  },
})
export class OrigamiScrollAreaScrollbar implements OrigamiScrollAreaScrollbarOptions {
  /**
   * Own axis, default `"vertical"`. Replaced Options supply the effective orientation instead.
   * Read when the Scrollbar registers; don't change it while it's mounted.
   */
  readonly orientation = input<OrigamiScrollAreaOrientation>("vertical");

  readonly #options = injectDeferred(OrigamiScrollAreaScrollbarOptions);
  readonly #context = inject(ScrollAreaContext);
  readonly #destroyRef = inject(DestroyRef);
  readonly #part: ScrollAreaScrollbarPart = {
    element: inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
    rendered: false,
    axis: null,
    thumb: null,
  };

  /** @internal The effective orientation. */
  protected readonly orientationAttribute = computed(() => this.#options().orientation());
  /** @internal Present while the root is active and this axis overflows. */
  protected readonly visibleAttribute = computed(() => {
    let overflows = this.#context.overflowY();

    if (this.orientationAttribute() === "horizontal") {
      overflows = this.#context.overflowX();
    }

    if (this.#context.active() && overflows) {
      return "";
    }

    return null;
  });

  constructor() {
    inject(ScrollAreaScrollbarContext).part = this.#part;

    afterNextRender(() => {
      const element = this.#part.element;
      const pressed = (event: PointerEvent): void => {
        this.#context.pressed(this.#part, event);
      };
      const moved = (event: PointerEvent): void => {
        this.#context.moved(this.#part, event);
      };
      const released = (event: PointerEvent): void => {
        this.#context.released(this.#part, event);
      };
      const wheeled = (event: WheelEvent): void => {
        this.#context.wheeled(this.#part, event);
      };

      element.addEventListener("pointerdown", pressed);
      element.addEventListener("pointermove", moved);
      element.addEventListener("pointerup", released);
      element.addEventListener("pointercancel", released);
      element.addEventListener("lostpointercapture", released);
      element.addEventListener("wheel", wheeled, { passive: false });
      this.#destroyRef.onDestroy(() => {
        element.removeEventListener("pointerdown", pressed);
        element.removeEventListener("pointermove", moved);
        element.removeEventListener("pointerup", released);
        element.removeEventListener("pointercancel", released);
        element.removeEventListener("lostpointercapture", released);
        element.removeEventListener("wheel", wheeled);
      });
      this.#context.partRendered(this.#part);
    });
  }

  /** @internal Registers for its orientation once Angular has set its inputs; a second fails. */
  ngOnInit(): void {
    let axis: "x" | "y" = "y";

    if (untracked(() => this.#options().orientation()) === "horizontal") {
      axis = "x";
    }

    this.#context.registerScrollbar(this.#part, axis, this.#destroyRef);
  }
}
