import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** Lays out the title and description, beside the icon tile when there is one. */
@Directive({
  selector: "[fold__AlertDialogHeader]",
  host: { "data-slot": "alert-dialog-header", "[class]": "classes()" },
})
export class AlertDialogHeader {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "grid gap-x-3 gap-y-1.5 has-data-[slot=alert-dialog-icon]:grid-cols-[auto_1fr]",
      this.class(),
    ),
  );
}
