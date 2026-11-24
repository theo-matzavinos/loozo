import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** A muted line under the PageTitle, in the same title block. */
@Directive({
  selector: "[fold__PageDescription]",
  host: { "data-slot": "page-description", "[class]": "classes()" },
})
export class PageDescription {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("mt-1 max-w-[68ch] text-body text-muted-foreground", this.class()),
  );
}
