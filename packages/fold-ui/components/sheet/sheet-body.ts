import { Component, computed, input } from "@angular/core";
import { cn } from "../cn";
import { ScrollArea } from "../scroll-area";

/**
 * The part that scrolls when the sheet runs out of height, so the header and footer stay put. It
 * scrolls in a ScrollArea with its scrollbar at the sheet's edge and room for focus rings: lay out
 * its content in an element of your own inside it; its `class` sizes and places the Body itself.
 * Its viewport isn't given a tabindex, so the sheet's initial focus still goes to the first control,
 * and a control focused near an edge scrolls into view with the viewport's 16px scroll padding.
 * The modal keeps the page behind it scroll-locked.
 */
@Component({
  selector: "[fold__SheetBody]",
  imports: [ScrollArea],
  host: { "data-slot": "sheet-body", "[class]": "classes()" },
  template: `
    <div
      fold__ScrollArea
      [viewportTabIndex]="null"
      class="min-h-0 [&>[data-slot=scroll-area-viewport]]:scroll-py-4"
    >
      <div class="px-5 py-1"><ng-content /></div>
    </div>
  `,
})
export class SheetBody {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("-mx-5 -my-1 flex min-h-0 flex-col", this.class()),
  );
}
