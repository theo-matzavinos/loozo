import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** Right-aligned actions, 8px apart, at the bottom of the sheet. */
@Directive({
  selector: "[fold__SheetFooter]",
  host: { "data-slot": "sheet-footer", "[class]": "classes()" },
})
export class SheetFooter {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("mt-auto flex shrink-0 flex-wrap justify-end gap-2", this.class()),
  );
}
