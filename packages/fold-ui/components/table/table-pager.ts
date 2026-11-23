import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/**
 * The pager bar at a TableFrame's bottom, outside its scroller. Its first child, unless it's a button
 * or a link, takes the free space, such as an `<output>` with the range. The `nav`'s name, the text,
 * the buttons and their boundary checks are yours.
 */
@Directive({
  selector: "nav[fold__TablePager]",
  host: { "data-slot": "table-pager", "[class]": "classes()" },
})
export class TablePager {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "flex flex-wrap items-center justify-end gap-2 border-t border-border px-3 py-2 text-label text-muted-foreground tabular-nums [&>:first-child:not(button,a)]:me-auto",
      this.class(),
    ),
  );
}
