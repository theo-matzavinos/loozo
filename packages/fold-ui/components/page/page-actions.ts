import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/**
 * The page's buttons, at the PageHeader's end while they fit beside the title block, and below it
 * as a whole otherwise. It never shrinks into the title block, and stays inside the header when it's
 * alone on its line, where its own buttons wrap.
 */
@Directive({
  selector: "[fold__PageActions]",
  host: { "data-slot": "page-actions", "[class]": "classes()" },
})
export class PageActions {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("flex max-w-full flex-none flex-wrap items-center gap-2", this.class()),
  );
}
