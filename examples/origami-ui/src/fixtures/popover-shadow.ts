import { Component, ElementRef, ViewEncapsulation, signal, viewChild } from "@angular/core";
import {
  OrigamiPopover,
  OrigamiPopoverTrigger,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
} from "@loozo/origami-ui/popover";

/** V19: a control in its own open shadow root, rendered inside Popover Content. */
@Component({
  selector: "acceptance-popover-shadow-field",
  encapsulation: ViewEncapsulation.ShadowDom,
  template: `<button type="button" data-testid="shadow-nested">Nested</button>`,
})
export class PopoverShadowField {}

/**
 * V19: a whole Popover in an open shadow root, with a nested shadow root inside its Content, so
 * the document's `activeElement` is the outer host wherever focus is in it. Its controls are
 * script actions.
 */
@Component({
  selector: "acceptance-popover-shadow",
  encapsulation: ViewEncapsulation.ShadowDom,
  imports: [
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
    PopoverShadowField,
  ],
  template: `
    <div ogPopover [(open)]="open" (openChange)="changed($event)">
      <button ogPopoverTrigger ogPopoverAnchor data-testid="shadow-trigger">Shadow</button>
      <div ogPopoverContent data-testid="shadow-content" role="group" aria-label="Shadow">
        <acceptance-popover-shadow-field />
      </div>
    </div>
    <button #after type="button" data-testid="shadow-after">After</button>
    <output data-testid="shadow-intent">{{ open() }}</output>
    <button type="button" data-testid="shadow-close" (click)="open.set(false)">Close</button>
    <button type="button" data-testid="shadow-arm-move" (click)="moveOnClose = true">
      Move focus on the next close
    </button>
  `,
})
export class PopoverShadow {
  readonly open = signal(false);
  readonly after = viewChild.required<ElementRef<HTMLButtonElement>>("after");

  /** Whether the next close's `openChange` listener moves focus to After, in this shadow root. */
  protected moveOnClose = false;

  protected changed(open: boolean): void {
    if (open || !this.moveOnClose) {
      return;
    }

    this.moveOnClose = false;
    this.after().nativeElement.focus();
  }
}
