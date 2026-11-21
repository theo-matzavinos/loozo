import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from "@angular/core";
import { ScrollAreaContext } from "./scroll-area-context";
import type { ScrollAreaPart } from "./scroll-area-context";
import { ScrollAreaScrollbarContext } from "./scroll-area-scrollbar-context";

/**
 * The draggable thumb inside an `[ogScrollAreaScrollbar]`. Origami writes its main-axis size
 * (`height` or `width`) and a `transform` inline from the browser; nothing is bound, so server
 * HTML has neither. The requested length is the rail scaled by the visible fraction; your CSS
 * minimum on the scrolling axis (`min-block-size` or `min-inline-size`, any unit, changeable at
 * any time) may make it longer, and Origami measures the length the browser used. Don't give it a
 * main-axis size of your own or make it a stretched flex item. When the rail is shorter than the
 * minimum, the thumb sits at the rail's start and can't be dragged; clip it with `overflow: clip`
 * on the track.
 *
 * Requires a nearest Scrollbar, which supports one Thumb; a second fails when it registers. It is
 * observed on its border box, so a CSS change to its size re-measures in the next frame.
 */
@Directive({ selector: "[ogScrollAreaThumb]" })
export class OrigamiScrollAreaThumb {
  readonly #context = inject(ScrollAreaContext);
  readonly #scrollbar = inject(ScrollAreaScrollbarContext);
  readonly #destroyRef = inject(DestroyRef);
  readonly #part: ScrollAreaPart = {
    element: inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
    rendered: false,
  };

  constructor() {
    afterNextRender(() => {
      this.#context.thumbRendered(this.#part);
    });
  }

  /** @internal Takes its Scrollbar's Thumb slot once Angular has set its inputs; a second fails. */
  ngOnInit(): void {
    const scrollbar = this.#scrollbar.part;

    if (scrollbar !== null) {
      this.#context.registerThumb(scrollbar, this.#part, this.#destroyRef);
    }
  }
}
