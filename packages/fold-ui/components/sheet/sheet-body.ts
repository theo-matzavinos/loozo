import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/**
 * The part that scrolls when the sheet runs out of height, so the header and footer stay put.
 * Its scrollbar sits at the sheet's edge, with room for focus rings.
 */
@Directive({
  selector: "[fold__SheetBody]",
  host: { "data-slot": "sheet-body", "[class]": "classes()" },
})
export class SheetBody {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("-mx-5 -my-1 min-h-0 overflow-y-auto px-5 py-1", this.class()),
  );
}
