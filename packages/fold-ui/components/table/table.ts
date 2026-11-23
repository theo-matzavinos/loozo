import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** A native `<table>`, full width with collapsed borders. Name it with `aria-labelledby` or `aria-label`. */
@Directive({
  selector: "table[fold__Table]",
  host: { "data-slot": "table", "[class]": "classes()" },
})
export class Table {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("w-full border-collapse text-body text-foreground", this.class()),
  );
}
