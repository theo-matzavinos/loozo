import { Directive, computed, input } from "@angular/core";
import { OrigamiTabsList } from "@loozo/origami-ui/tabs";
import { cn } from "../cn";

/**
 * The row of TabsTriggers, 20px apart on a 1px baseline; a column with an inline-end baseline
 * when the Tabs are vertical. Name it with `aria-label` or `aria-labelledby`.
 */
@Directive({
  selector: "[fold__TabsList]",
  hostDirectives: [OrigamiTabsList],
  host: { "data-slot": "tabs-list", "[class]": "classes()" },
})
export class TabsList {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "flex shrink-0 gap-5 border-b border-border",
      "aria-[orientation=vertical]:flex-col aria-[orientation=vertical]:gap-0 aria-[orientation=vertical]:border-b-0 aria-[orientation=vertical]:border-e",
      this.class(),
    ),
  );
}
