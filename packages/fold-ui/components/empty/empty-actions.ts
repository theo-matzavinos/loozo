import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** A centered, wrapping row of the Empty's buttons or links. */
@Directive({
  selector: "[fold__EmptyActions]",
  host: { "data-slot": "empty-actions", "[class]": "classes()" },
})
export class EmptyActions {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("mt-3 flex flex-wrap justify-center gap-2", this.class()),
  );
}
