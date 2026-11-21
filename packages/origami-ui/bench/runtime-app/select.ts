import { Component, ElementRef, afterNextRender, viewChild } from "@angular/core";
import {
  OrigamiSelect,
  OrigamiSelectContent,
  OrigamiSelectOption,
  OrigamiSelectTrigger,
} from "@loozo/origami-ui/select";
import { installOpenProbe } from "./bench-probe";

const options = 1000;

// The select-1000 scenario: 1,000 options, rendered only while the content is open.
@Component({
  selector: "bench-select",
  imports: [OrigamiSelect, OrigamiSelectTrigger, OrigamiSelectContent, OrigamiSelectOption],
  template: `
    <div ogSelect>
      <button #trigger id="trigger" ogSelectTrigger aria-label="Option">Choose option</button>
      <div
        #content="ogSelectContent"
        id="content"
        ogSelectContent
        side="block-end"
        align="start"
        [gap]="8"
      >
        @if (content.state.open()) {
          @for (item of items; track item) {
            <div ogSelectOption [value]="item">Option {{ item }}</div>
          }
        }
      </div>
    </div>
  `,
})
export class SelectOpen {
  readonly items = Array.from({ length: options }, (_, index) => index);
  readonly trigger = viewChild.required("trigger", { read: ElementRef });
  readonly content = viewChild.required("content", { read: ElementRef });

  constructor() {
    afterNextRender(() => {
      installOpenProbe({
        trigger: this.trigger().nativeElement,
        content: this.content().nativeElement,
        input: "click",
        items: { selector: '[role="option"]', count: options },
      });
    });
  }
}
