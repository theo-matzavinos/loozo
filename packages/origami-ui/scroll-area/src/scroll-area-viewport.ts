import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from "@angular/core";
import { ScrollAreaContext } from "./scroll-area-context";
import type { ScrollAreaPart } from "./scroll-area-context";

/**
 * The ScrollArea's native scroller: wheel, touch, keyboard, selection, focus scrolling and
 * `scrollTo` are the browser's own. Origami hides its native scrollbars and owns its overflow: it
 * binds `overflow-x: auto` while a horizontal Scrollbar is registered and `hidden` otherwise, and
 * `overflow-y` likewise for a vertical one, so a panel without a horizontal Scrollbar doesn't
 * scroll sideways. Registrations exist at render, so server HTML already has the final overflow.
 * Override an axis with a template `[style.overflow-x]` binding, which outranks a host binding.
 *
 * Host semantics: static `tabindex="0"`, so the scroller takes keyboard focus in every engine
 * (WebKit doesn't focus a scroller on its own), which a static `tabindex` of yours replaces; a bound
 * `scrollbar-width: none`, so the native bars never paint, also before hydration. Origami gives it
 * no static style, so hydration leaves the server's `style` until the bindings write the same
 * values: it keeps its position and its axes, and a key that triggers `hydrate on interaction`
 * scrolls it as it would a plain scroller. A static `style` of yours brings back a rewrite: Angular
 * replaces it with your declarations alone until the bindings run, so if the area can scroll before
 * hydration, style it with a class or a `[style]` binding. No role and no name: give a meaningful
 * region `role="region"` and an accessible name.
 *
 * Give it a bounded size (`block-size: 100%` of a sized root, or a `max-block-size`), or it grows
 * instead of scrolling. Requires a nearest ScrollArea root, which supports one mounted Viewport; a
 * second fails when it registers. Readers use it only once it has rendered in the browser; until
 * then, and while it is still dehydrated, the root reports no overflow and its Scrollbars take no
 * input. It adds its `scroll` listener with `addEventListener`, so Origami adds no `jsaction`.
 */
@Directive({
  selector: "[ogScrollAreaViewport]",
  host: {
    tabindex: "0",
    "[style.scrollbar-width]": "'none'",
    "[style.overflow-x]": "overflowX()",
    "[style.overflow-y]": "overflowY()",
  },
})
export class OrigamiScrollAreaViewport {
  readonly #context = inject(ScrollAreaContext);
  readonly #destroyRef = inject(DestroyRef);
  readonly #part: ScrollAreaPart = {
    element: inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
    rendered: false,
  };

  /** @internal `auto` while a horizontal Scrollbar is registered, else `hidden`. */
  protected readonly overflowX = this.#context.viewportOverflowX;
  /** @internal `auto` while a vertical Scrollbar is registered, else `hidden`. */
  protected readonly overflowY = this.#context.viewportOverflowY;

  constructor() {
    afterNextRender(() => {
      const element = this.#part.element;
      const scrolled = (): void => {
        this.#context.scrolled(this.#part);
      };

      element.addEventListener("scroll", scrolled, { passive: true });
      this.#destroyRef.onDestroy(() => {
        element.removeEventListener("scroll", scrolled);
      });
      this.#context.viewportRendered(this.#part);
    });
  }

  /** @internal Registers with the root once Angular has set its inputs; a second fails. */
  ngOnInit(): void {
    this.#context.registerViewport(this.#part, this.#destroyRef);
  }
}
