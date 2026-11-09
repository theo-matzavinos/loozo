import { DestroyRef, Directive, ElementRef, inject } from "@angular/core";
import { SliderContext } from "./slider-context";
import type { SliderPart } from "./slider-context";

/**
 * The Slider's pointer surface. A primary press on it focuses the Thumb and, while user writes
 * apply, captures the pointer: a press elsewhere on the Track moves the value to the pointer at
 * once, a press on the Thumb keeps its grab offset, and every move of that pointer writes the
 * allowed value nearest to it over the Track's border box, clamped at the ends, also outside the
 * Track. In right-to-left text, the Track's computed `direction` at the press, positions run from
 * its right edge. The drag ends on `pointerup`, `pointercancel` or `lostpointercapture`, at the
 * next event of its pointer or change detection after the slider becomes disabled or readonly,
 * and when the root, the Track or the Thumb is destroyed.
 * While readonly a press only focuses the Thumb; while disabled it does nothing; other buttons
 * are ignored.
 *
 * Put the Thumb inside it: a Thumb outside the Track is keyboard-only. Origami binds nothing on
 * it; give it `touch-action: pan-y` so a horizontal touch drags while a vertical one scrolls the
 * page. A press before the slider hydrates is applied once when it does, without a drag.
 * Requires a nearest Slider root; a second mounted Track fails.
 */
@Directive({
  selector: "[ogSliderTrack]",
  host: {
    "(pointerdown)": "pressed($event)",
    "(pointermove)": "moved($event)",
    "(pointerup)": "released($event)",
    "(pointercancel)": "released($event)",
    "(lostpointercapture)": "released($event)",
  },
})
export class OrigamiSliderTrack {
  readonly #context = inject(SliderContext);
  readonly #destroyRef = inject(DestroyRef);
  readonly #part: SliderPart = {
    element: inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
  };

  /** @internal Registers with the Slider once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.registerTrack(this.#part, this.#destroyRef);
  }

  /** @internal A press: focus, and a jump and drag while writes apply. */
  protected pressed(event: PointerEvent): void {
    this.#context.press(event, this.#part);
  }

  /** @internal A move of the drag's pointer. */
  protected moved(event: PointerEvent): void {
    this.#context.move(event, this.#part);
  }

  /** @internal The drag's pointer released, canceled or uncaptured. */
  protected released(event: PointerEvent): void {
    this.#context.release(event, this.#part);
  }
}
