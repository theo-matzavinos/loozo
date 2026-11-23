import { Component, computed, input } from "@angular/core";
import { cn } from "../cn";
import { ScrollArea } from "../scroll-area";

/**
 * A bordered surface around a Table and its TablePager. The table scrolls sideways in a
 * ScrollArea whose viewport is always a Tab stop, so the keyboard can scroll it before and after
 * hydration; the pager stays put below it. Name it with `[aria-labelledby]` or `[aria-label]`, as
 * inputs, never `[attr.…]`: the name goes to the scrolling viewport, which becomes a region.
 *
 * An Empty that is the only cell's direct child in a body row of the frame's own table stays inside
 * the visible width while the table scrolls; a table nested in a cell keeps its own layout.
 *
 * @example
 * ```html
 * <div fold__TableFrame aria-labelledby="budgets-title">
 *   <table fold__Table aria-labelledby="budgets-title">…</table>
 *   <nav fold__TablePager aria-label="Budgets pages">…</nav>
 * </div>
 * ```
 */
@Component({
  selector: "[fold__TableFrame]",
  imports: [ScrollArea],
  host: {
    "data-slot": "table-frame",
    // The name belongs to the focusable viewport; a static attribute would otherwise also stay on the frame.
    "[attr.aria-label]": "null",
    "[attr.aria-labelledby]": "null",
    "[class]": "classes()",
  },
  // The ScrollArea root is a size container, so 100cqi is the viewport's visible width.
  template: `
    <div
      fold__ScrollArea
      orientation="horizontal"
      [aria-label]="ariaLabel()"
      [aria-labelledby]="ariaLabelledby()"
      class="@container rounded-t-[inherit] last:rounded-b-[inherit]"
    >
      <ng-content />
    </div>
    <ng-content select="[fold__TablePager]" />
  `,
})
export class TableFrame {
  readonly ariaLabel = input<string | null>(null, { alias: "aria-label" });
  readonly ariaLabelledby = input<string | null>(null, { alias: "aria-labelledby" });
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "flex min-w-0 flex-col overflow-clip rounded-surface border border-border bg-surface",
      // Child combinators down to the frame's own table, so a table nested in one of its cells
      // keeps its own last-row border and Empty layout. Only the last body that has rows loses its
      // last border, so groups in several bodies keep their separator, and an empty trailing body
      // doesn't leave a doubled line.
      "[&>[data-slot=scroll-area]>[data-slot=scroll-area-viewport]>[data-slot=scroll-area-content]>table>tbody:has(>tr):not(:has(~tbody>tr))>tr:last-child]:border-b-0",
      // A full-span empty row's Empty: the visible width less the cell's 12px padding on each side,
      // sticky 12px from the scroller's start, so it's on screen at any scroll position. Only a
      // body row's only cell, so an Empty beside other cells keeps its own layout.
      "[&>[data-slot=scroll-area]>[data-slot=scroll-area-viewport]>[data-slot=scroll-area-content]>table>tbody>tr>td[data-slot=table-cell]:only-child>[data-slot=empty]]:sticky",
      "[&>[data-slot=scroll-area]>[data-slot=scroll-area-viewport]>[data-slot=scroll-area-content]>table>tbody>tr>td[data-slot=table-cell]:only-child>[data-slot=empty]]:start-3",
      "[&>[data-slot=scroll-area]>[data-slot=scroll-area-viewport]>[data-slot=scroll-area-content]>table>tbody>tr>td[data-slot=table-cell]:only-child>[data-slot=empty]]:w-[calc(100cqi-1.5rem)]",
      this.class(),
    ),
  );
}
