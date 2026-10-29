import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** Right-aligned actions, 8px apart. */
@Directive({
  selector: "[fold__AlertDialogFooter]",
  host: { "data-slot": "alert-dialog-footer", "[class]": "classes()" },
})
export class AlertDialogFooter {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("mt-5 flex flex-wrap justify-end gap-2", this.class()),
  );
}
