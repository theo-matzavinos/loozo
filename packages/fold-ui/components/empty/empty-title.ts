import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** The Empty's title, in the foreground color. The heading level is yours. */
@Directive({
  selector: "[fold__EmptyTitle]",
  host: { "data-slot": "empty-title", "[class]": "classes()" },
})
export class EmptyTitle {
  readonly class = input("");

  protected readonly classes = computed(() => cn("text-title text-foreground", this.class()));
}
