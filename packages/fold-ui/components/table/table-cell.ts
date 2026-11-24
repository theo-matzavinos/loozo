import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";
import type { TableAlign } from "./table-column-header";

/**
 * A body cell on a native `<td>`. `align="end"` aligns it to the end with tabular figures, for
 * money and number columns; give its TableColumnHeader the same `align`.
 */
@Directive({
  selector: "td[fold__TableCell]",
  host: { "data-slot": "table-cell", "[attr.data-align]": "align()", "[class]": "classes()" },
})
export class TableCell {
  readonly align = input<TableAlign>("start");
  readonly class = input("");

  protected readonly classes = computed(() => {
    // Start by default, so an inherited text-end doesn't override align="start". Resolved here
    // rather than as a data-align variant, so the caller's alignment utility wins.
    let alignment = "text-start";

    if (this.align() === "end") {
      alignment = "text-end tabular-nums";
    }

    return cn("h-10 px-3 py-2 align-middle", alignment, this.class());
  });
}
