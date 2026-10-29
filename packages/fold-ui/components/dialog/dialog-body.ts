import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/**
 * The part that scrolls when the dialog runs out of height, so the header and footer stay put.
 * Its scrollbar sits at the dialog's edge, with room for focus rings.
 */
@Directive({
  selector: "[fold__DialogBody]",
  host: { "data-slot": "dialog-body", "[class]": "classes()" },
})
export class DialogBody {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("-mx-5 -my-1 min-h-0 overflow-y-auto px-5 py-1", this.class()),
  );
}
