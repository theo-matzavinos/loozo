import { Component, ElementRef, afterNextRender, viewChild } from "@angular/core";
import {
  OrigamiMenu,
  OrigamiMenuContent,
  OrigamiMenuItem,
  OrigamiMenuTrigger,
} from "@loozo/origami-ui/menu";
import { installOpenProbe } from "./bench-probe";

const actions = 100;

// The menu-100 scenario: 100 items, rendered only while the content is open. index.html keeps the
// content compact and scrolling, so it stays at its anchor with every item mounted.
@Component({
  selector: "bench-menu",
  imports: [OrigamiMenu, OrigamiMenuTrigger, OrigamiMenuContent, OrigamiMenuItem],
  template: `
    <div ogMenu>
      <button #trigger id="trigger" ogMenuTrigger>Open menu</button>
      <div
        #content="ogMenuContent"
        id="content"
        ogMenuContent
        side="block-end"
        align="start"
        [gap]="8"
      >
        @if (content.state.open()) {
          @for (item of items; track item) {
            <button ogMenuItem>Action {{ item }}</button>
          }
        }
      </div>
    </div>
  `,
})
export class MenuOpen {
  readonly items = Array.from({ length: actions }, (_, index) => index);
  readonly trigger = viewChild.required("trigger", { read: ElementRef });
  readonly content = viewChild.required("content", { read: ElementRef });

  constructor() {
    afterNextRender(() => {
      installOpenProbe({
        trigger: this.trigger().nativeElement,
        content: this.content().nativeElement,
        input: "click",
        items: { selector: '[role="menuitem"]', count: actions },
      });
    });
  }
}
