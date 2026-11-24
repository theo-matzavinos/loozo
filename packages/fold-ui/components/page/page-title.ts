import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** The page's title, on your own heading element: the heading level is yours. */
@Directive({
  selector: "[fold__PageTitle]",
  host: { "data-slot": "page-title", "[class]": "classes()" },
})
export class PageTitle {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("text-headline text-foreground [overflow-wrap:anywhere]", this.class()),
  );
}
