import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/**
 * An empty state: centered, muted text that works as plain projected text alone, with an optional
 * EmptyTitle, EmptyDescription and EmptyActions. It isn't a live region, and loading or failure
 * isn't the empty state. In a table, put it inside a full-span cell with a `colspan`, never on the cell itself.
 *
 * @example
 * ```html
 * <div fold__Empty>No budgets match</div>
 * ```
 */
@Directive({
  selector: "[fold__Empty]",
  host: { "data-slot": "empty", "[class]": "classes()" },
})
export class Empty {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "flex flex-col items-center justify-center gap-1 px-6 py-10 text-center text-body text-muted-foreground [overflow-wrap:anywhere]",
      this.class(),
    ),
  );
}
