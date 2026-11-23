import { Component, computed, inject, input } from "@angular/core";
import { LucideArrowDown, LucideArrowUp, LucideArrowUpDown } from "@lucide/angular";
import { cn } from "../cn";
import { TableColumnHeader } from "./table-column-header";

/**
 * A sortable column's button, inside its TableColumnHeader: its label and an arrow for the header's
 * `sort`, ↑, ↓, or ↕ while unsorted. The icon leads in an end-aligned column. It only reflects the
 * header: your `(click)` changes the view's sort, which you bind back to the header's `sort`.
 *
 * @example
 * ```html
 * <th fold__TableColumnHeader [sort]="sortOf('name')">
 *   <button fold__TableSortButton (click)="toggleSort('name')">Name</button>
 * </th>
 * ```
 */
@Component({
  selector: "button[fold__TableSortButton]",
  imports: [LucideArrowDown, LucideArrowUp, LucideArrowUpDown],
  host: {
    "data-slot": "table-sort-button",
    type: "button",
    "[attr.data-sort]": "header.sort()",
    "[class]": "classes()",
  },
  template: `
    <ng-content />
    @switch (header.sort()) {
      @case ("ascending") {
        <svg lucideArrowUp data-slot="table-sort-icon" aria-hidden="true"></svg>
      }
      @case ("descending") {
        <svg lucideArrowDown data-slot="table-sort-icon" aria-hidden="true"></svg>
      }
      @default {
        <svg lucideArrowUpDown data-slot="table-sort-icon" aria-hidden="true"></svg>
      }
    }
  `,
})
export class TableSortButton {
  readonly class = input("");

  protected readonly header = inject(TableColumnHeader);

  protected readonly classes = computed(() => {
    const end = this.header.align() === "end";

    return cn(
      "-mx-2 inline-flex h-7 cursor-pointer items-center gap-1 rounded-control-sm px-2 text-label text-muted-foreground transition-colors duration-120",
      "hover:bg-foreground/8 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      // The unsorted ↕ keeps the label's full muted color, so sortability shows without hover.
      "data-sort:text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0",
      end && "flex-row-reverse",
      this.class(),
    );
  });
}
