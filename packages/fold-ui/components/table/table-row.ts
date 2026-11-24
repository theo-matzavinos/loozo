import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** A row with a 1px bottom border; a TableFrame drops it from the last body row. */
@Directive({
  selector: "tr[fold__TableRow]",
  host: { "data-slot": "table-row", "[class]": "classes()" },
})
export class TableRow {
  readonly class = input("");

  protected readonly classes = computed(() => cn("border-b border-border", this.class()));
}
