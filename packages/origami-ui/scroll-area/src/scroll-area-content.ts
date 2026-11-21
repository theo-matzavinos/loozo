import {
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  computed,
  inject,
} from "@angular/core";
import { ScrollAreaContext } from "./scroll-area-context";
import type { ScrollAreaPart } from "./scroll-area-context";

/**
 * The size wrapper inside the Viewport: the element whose resizes the root observes, so content
 * that grows or shrinks re-measures the Scrollbars. While a horizontal Scrollbar is registered,
 * Origami binds `min-inline-size: 100%` and `inline-size: max-content`, so wide content (a table)
 * scrolls sideways instead of wrapping, and narrow content still fills the Viewport; without one it
 * binds nothing, so vertical-only content wraps to the Viewport's width. If the area can scroll
 * sideways before hydration, style it with a class or a `[style]` binding: Angular's hydration
 * replaces a static `style` with your declarations alone until the sizing bindings run, and a
 * layout in between can reset the horizontal position.
 *
 * Optional: without it, content growth is noticed at the next pointer entry or scroll. Overflow
 * that grows inside a Content box whose own size doesn't change (a fixed-width wrapper) is noticed
 * the same way. Requires a nearest ScrollArea root, which supports one mounted Content; a second
 * fails when it registers.
 */
@Directive({
  selector: "[ogScrollAreaContent]",
  host: {
    "[style.min-inline-size]": "minInlineSize()",
    "[style.inline-size]": "inlineSize()",
  },
})
export class OrigamiScrollAreaContent {
  readonly #context = inject(ScrollAreaContext);
  readonly #destroyRef = inject(DestroyRef);
  readonly #part: ScrollAreaPart = {
    element: inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
    rendered: false,
  };

  /** @internal `100%` while a horizontal Scrollbar is registered. */
  protected readonly minInlineSize = computed(() => {
    if (this.#context.contentSized()) {
      return "100%";
    }

    return null;
  });
  /** @internal `max-content` while a horizontal Scrollbar is registered. */
  protected readonly inlineSize = computed(() => {
    if (this.#context.contentSized()) {
      return "max-content";
    }

    return null;
  });

  constructor() {
    afterNextRender(() => {
      this.#context.partRendered(this.#part);
    });
  }

  /** @internal Registers with the root once Angular has set its inputs; a second fails. */
  ngOnInit(): void {
    this.#context.registerContent(this.#part, this.#destroyRef);
  }
}
