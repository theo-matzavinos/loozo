import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/**
 * A row's muted trailing shortcut text, display only: it binds no key and screen readers don't
 * hear it. When you bind the key, add `aria-keyshortcuts` to the row.
 */
@Directive({
  selector: "[fold__MenuShortcut]",
  host: { "data-slot": "menu-shortcut", "aria-hidden": "true", "[class]": "classes()" },
})
export class MenuShortcut {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("ms-auto ps-4 text-label font-normal tracking-wide text-muted-foreground", this.class()),
  );
}
