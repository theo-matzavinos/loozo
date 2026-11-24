import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/**
 * The page's title row: a title block on the start side and PageActions on the end side while
 * both fit on one line, the actions wrapping below the title block as a whole when they don't. Put
 * the PageTitle and PageDescription in one element of yours, usually a `<div>`, so they stay one
 * block; a header with only a title needs no wrapper. Write the title block before PageActions.
 */
@Directive({
  selector: "[fold__PageHeader]",
  host: { "data-slot": "page-header", "[class]": "classes()" },
})
export class PageHeader {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "flex flex-wrap items-center gap-x-6 gap-y-3",
      // Every child but PageActions is a title block, growing from 16rem: the actions wrap exactly
      // when 16rem, the gap and their own width don't fit.
      "[&>:not([data-slot=page-actions])]:min-w-0 [&>:not([data-slot=page-actions])]:flex-[1_1_16rem]",
      this.class(),
    ),
  );
}
