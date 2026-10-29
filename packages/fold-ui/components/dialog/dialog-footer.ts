import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** Right-aligned actions, 8px apart. */
@Directive({
  selector: "[fold__DialogFooter]",
  host: { "data-slot": "dialog-footer", "[class]": "classes()" },
})
export class DialogFooter {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("flex shrink-0 flex-wrap justify-end gap-2", this.class()),
  );
}
