import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/**
 * A muted row in a ComboboxContent for no matches or a pending search, lined up with the
 * options' text. It isn't announced to screen readers.
 */
@Directive({
  selector: "[fold__ComboboxEmpty]",
  host: { "data-slot": "combobox-empty", "[class]": "classes()" },
})
export class ComboboxEmpty {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("flex min-h-8 items-center px-2 py-1.5 text-body text-muted-foreground", this.class()),
  );
}
