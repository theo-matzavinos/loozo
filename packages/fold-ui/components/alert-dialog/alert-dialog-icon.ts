import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** A 32px warning tile in the destructive tint, for an 18px icon. Hidden from assistive technology. */
@Directive({
  selector: "[fold__AlertDialogIcon]",
  host: { "data-slot": "alert-dialog-icon", "aria-hidden": "true", "[class]": "classes()" },
})
export class AlertDialogIcon {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "row-span-2 grid size-8 place-items-center rounded-control bg-destructive-tint text-destructive-text [&_svg]:size-[18px]",
      this.class(),
    ),
  );
}
