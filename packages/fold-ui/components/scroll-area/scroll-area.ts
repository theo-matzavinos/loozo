import { Component, ElementRef, computed, inject, input, viewChild } from "@angular/core";
import {
  OrigamiScrollArea,
  OrigamiScrollAreaContent,
  OrigamiScrollAreaScrollbar,
  OrigamiScrollAreaThumb,
  OrigamiScrollAreaViewport,
} from "@loozo/origami-ui/scroll-area";
import { cn } from "../cn";

// Grows into the root's flex column, so a definite height, a max height or a flex parent bounds it.
const VIEWPORT =
  "min-h-0 grow rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";
// A transparent 10px rail over the root's edge. Origami sets data-visible; visibility keeps a hidden
// rail from taking clicks and, transitioned, keeps a hiding one painted until its fade ends.
const TRACK =
  "absolute box-border overflow-clip p-0.5 touch-none invisible opacity-0 transition-[opacity,visibility] duration-120 ease-out data-visible:visible data-visible:opacity-100 motion-reduce:transition-none forced-color-adjust-none forced-colors:bg-[Canvas]";
// A 6px pill, darker while its rail is hovered, except in forced colors, where it stays CanvasText.
// Origami writes its length and position.
const THUMB =
  "box-border rounded-full bg-input not-forced-colors:[[data-slot=scroll-area-scrollbar]:hover>&]:bg-muted-foreground forced-color-adjust-none forced-colors:border forced-colors:border-[Canvas] forced-colors:bg-[CanvasText]";

/**
 * A scrolling box over Origami's ScrollArea: native scrolling with the browser's scrollbars
 * replaced by thin thumbs that fade in over its edge on hover, scroll or drag. Give it a height, a
 * max height or a flex parent to bound it, and lay out your content in an element of your own inside
 * it. Its template reference has `viewport()`, the native scroller.
 *
 * @example
 * ```html
 * <section class="h-80 rounded-surface border border-border">
 *   <div fold__ScrollArea orientation="both" aria-labelledby="addresses-title" class="size-full rounded-[inherit]" #area="fold__ScrollArea">
 *     <table>…</table>
 *   </div>
 * </section>
 * <button fold__Button (click)="area.viewport().scrollTo({ top: 0 })">Back to top</button>
 * ```
 */
@Component({
  selector: "[fold__ScrollArea]",
  exportAs: "fold__ScrollArea",
  imports: [
    OrigamiScrollAreaViewport,
    OrigamiScrollAreaContent,
    OrigamiScrollAreaScrollbar,
    OrigamiScrollAreaThumb,
  ],
  hostDirectives: [OrigamiScrollArea],
  host: {
    "data-slot": "scroll-area",
    "[class]": "classes()",
    // The name belongs to the focusable viewport; a static attribute would otherwise also stay on the root.
    "[attr.aria-label]": "null",
    "[attr.aria-labelledby]": "null",
  },
  // Each rail keeps one orientation, which Origami requires; `orientation` mounts and unmounts them.
  template: `
    <div
      #viewport
      ogScrollAreaViewport
      data-slot="scroll-area-viewport"
      class="${VIEWPORT}"
      [attr.role]="role()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-labelledby]="ariaLabelledby()"
    >
      <div ogScrollAreaContent data-slot="scroll-area-content"><ng-content /></div>
    </div>
    @if (orientation() !== "horizontal") {
      <div
        ogScrollAreaScrollbar
        orientation="vertical"
        data-slot="scroll-area-scrollbar"
        [class]="verticalTrack()"
      >
        <div ogScrollAreaThumb data-slot="scroll-area-thumb" class="${THUMB} min-h-[18px]"></div>
      </div>
    }
    @if (orientation() !== "vertical") {
      <div
        ogScrollAreaScrollbar
        orientation="horizontal"
        data-slot="scroll-area-scrollbar"
        [class]="horizontalTrack()"
      >
        <div
          ogScrollAreaThumb
          data-slot="scroll-area-thumb"
          class="${THUMB} h-full min-w-[18px]"
        ></div>
      </div>
    }
  `,
})
export class ScrollArea {
  readonly orientation = input<"vertical" | "horizontal" | "both">("vertical");
  readonly ariaLabel = input<string | null>(null, { alias: "aria-label" });
  readonly ariaLabelledby = input<string | null>(null, { alias: "aria-labelledby" });
  readonly class = input("");

  /** Origami's readonly observation: `overflowX`, `overflowY` and `active`. */
  readonly state = inject(OrigamiScrollArea).state;

  // TypeScript-private, not `#viewport`: Angular rejects ES-private query fields (NG1053).
  private readonly viewportElement = viewChild.required<ElementRef<HTMLElement>>("viewport");

  /** The native scroller, for `scrollTo()`, `scrollTop` and listeners; valid once the view has rendered. */
  readonly viewport = computed(() => this.viewportElement().nativeElement);

  /** `region` only while named: ARIA requires a region to have a name. */
  protected readonly role = computed(() => {
    if (this.ariaLabel() || this.ariaLabelledby()) {
      return "region";
    }

    return null;
  });

  // In `both`, each rail stops 10px short of the other's corner while the other axis overflows.
  // Parent-combinator variants, so a nested ScrollArea doesn't read an outer root's attributes.
  protected readonly verticalTrack = computed(() => {
    if (this.orientation() === "both") {
      return cn(TRACK, "inset-y-0 end-0 w-2.5 [[data-overflow-x]>&]:bottom-2.5");
    }

    return cn(TRACK, "inset-y-0 end-0 w-2.5");
  });

  protected readonly horizontalTrack = computed(() => {
    if (this.orientation() === "both") {
      return cn(TRACK, "inset-x-0 bottom-0 h-2.5 [[data-overflow-y]>&]:end-2.5");
    }

    return cn(TRACK, "inset-x-0 bottom-0 h-2.5");
  });

  // A flex column, so the viewport's `grow` fills a definite height and stops at a max height.
  protected readonly classes = computed(() =>
    cn("relative flex min-h-0 min-w-0 flex-col", this.class()),
  );
}
