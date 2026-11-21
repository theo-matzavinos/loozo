import {
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  numberAttribute,
} from "@angular/core";
import { ScrollAreaContext } from "./scroll-area-context";
import { OrigamiScrollAreaOptions } from "./scroll-area-options";
import { OrigamiScrollAreaState } from "./scroll-area-state";

/**
 * ScrollArea root: a native scroller (`OrigamiScrollAreaViewport`) whose scrollbars are
 * drawn by your own elements: one `OrigamiScrollAreaScrollbar` track per axis, each with an
 * `OrigamiScrollAreaThumb`, overlaid on the Viewport's edge by your CSS. Scrolling stays
 * native; Origami hides the native bars, owns the Viewport's overflow and the Content's sizing,
 * measures the overflow, places and sizes the thumbs, maps thumb drags, track presses and wheels
 * over the tracks to the Viewport, and decides when the bars show. You own the markup, every
 * style, the Viewport's size and name, and any corner.
 *
 * Host semantics: empty `data-overflow-x` and `data-overflow-y` while the attached Viewport
 * overflows on that axis, absent otherwise and in server HTML. Use them to stop one track at the
 * other (`[data-overflow-y] [data-orientation="horizontal"] { inset-inline-end: 10px }`). No
 * role.
 *
 * Visibility: the root is active while the pointer is over it (also a pointer resting over it
 * through hydration), during a drag and on each scroll, until `hideDelay` ms after the last of
 * those; a Scrollbar is `data-visible` while the root is active and its axis overflows.
 *
 * Server rendering and hydration: server HTML has the Viewport's hidden native bars, its overflow,
 * `tabindex` and the tracks' `data-orientation`, and no bars painted: they appear once the browser
 * has measured, after hydration, without moving the content. Before hydration, and while a part is
 * still dehydrated, the Viewport scrolls natively. Origami adds no Angular event bindings, so it
 * adds no `jsaction` and nothing is replayed. Keep a ScrollArea's parts in one hydrate boundary: a
 * Scrollbar in its own dormant `@defer (hydrate …)` block leaves its axis `overflow: hidden` until
 * it hydrates.
 *
 * Geometry: lengths are layout px, so an ancestor's translation and scale are supported; rotation,
 * skew and negative scale are not. Size changes apply in the next animation frame.
 *
 * @example
 * ```html
 * <div ogScrollArea class="scroll-area">
 *   <div ogScrollAreaViewport class="viewport" role="region" aria-label="Addresses">
 *     <div ogScrollAreaContent><table>…</table></div>
 *   </div>
 *   <div ogScrollAreaScrollbar orientation="vertical" class="scrollbar">
 *     <div ogScrollAreaThumb class="thumb"></div>
 *   </div>
 *   <div ogScrollAreaScrollbar orientation="horizontal" class="scrollbar">
 *     <div ogScrollAreaThumb class="thumb"></div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogScrollArea]",
  exportAs: "ogScrollArea",
  providers: [
    OrigamiScrollAreaOptions.provideExisting(() => OrigamiScrollArea),
    ScrollAreaContext,
    OrigamiScrollAreaState,
  ],
  host: {
    "[attr.data-overflow-x]": "overflowXAttribute()",
    "[attr.data-overflow-y]": "overflowYAttribute()",
  },
})
export class OrigamiScrollArea implements OrigamiScrollAreaOptions {
  /**
   * Own hide delay in ms, default 600, with number-attribute coercion (`hideDelay="300"`): how long
   * the Scrollbars stay visible after the pointer leaves, a drag ends or scrolling stops. It should
   * be finite and nonnegative. Replaced Options supply the effective delay instead.
   */
  readonly hideDelay = input(600, { transform: numberAttribute });
  /** This root's readonly overflow and visibility, shared with its descendants. */
  readonly state = inject(OrigamiScrollAreaState);

  readonly #context = inject(ScrollAreaContext);

  /** @internal Present while the Viewport overflows horizontally. */
  protected readonly overflowXAttribute = computed(() => {
    if (this.#context.overflowX()) {
      return "";
    }

    return null;
  });
  /** @internal Present while the Viewport overflows vertically. */
  protected readonly overflowYAttribute = computed(() => {
    if (this.#context.overflowY()) {
      return "";
    }

    return null;
  });

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const entered = (): void => {
        this.#context.entered();
      };
      const left = (): void => {
        this.#context.left();
      };

      element.addEventListener("pointerenter", entered);
      element.addEventListener("pointerleave", left);
      destroyRef.onDestroy(() => {
        element.removeEventListener("pointerenter", entered);
        element.removeEventListener("pointerleave", left);
      });
      this.#context.rootRendered(element);
    });
  }
}
