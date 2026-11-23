import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** A column's alignment: `end` for money and number columns. */
export type TableAlign = "start" | "end";

/** The direction a column is sorted in. */
export type TableSort = "ascending" | "descending";

/**
 * A column header on a native `<th>`, with `scope="col"`. `align="end"` aligns it to the end, like
 * its cells. `sort` reflects the view's sort as `aria-sort`; `null`, the default, leaves the column
 * unsorted. Put a TableSortButton inside to make it sortable. An action column needs header text,
 * visually hidden if you like.
 */
@Directive({
  selector: "th[fold__TableColumnHeader]",
  host: {
    "data-slot": "table-column-header",
    scope: "col",
    "[attr.data-align]": "align()",
    "[attr.aria-sort]": "sort()",
    "[class]": "classes()",
  },
})
export class TableColumnHeader {
  readonly align = input<TableAlign>("start");
  readonly sort = input<TableSort | null>(null);
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "h-9 px-3 text-start align-middle text-label whitespace-nowrap text-muted-foreground data-[align=end]:text-end",
      this.class(),
    ),
  );
}
