import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** What the Empty means and what to do next, kept to a readable width. */
@Directive({
  selector: "[fold__EmptyDescription]",
  host: { "data-slot": "empty-description", "[class]": "classes()" },
})
export class EmptyDescription {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("max-w-[48ch] text-body text-muted-foreground", this.class()),
  );
}
