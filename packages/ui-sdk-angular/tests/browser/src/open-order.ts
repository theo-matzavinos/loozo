import { Component } from "@angular/core";
import {
  UiSelect,
  UiSelectContent,
  UiSelectItem,
  UiSelectTrigger,
} from "@loozo/ui-sdk-angular/select";
import { startWindow } from "./probe";

/**
 * Two Selects that start open: one with its content before an authored-id trigger (D19, C21), one
 * in D19's order, trigger first.
 */
@Component({
  selector: "app-open-order",
  imports: [UiSelect, UiSelectTrigger, UiSelectContent, UiSelectItem],
  template: `
    <div uiSelect data-testid="open-order" defaultValue="one" [defaultOpen]="true">
      <div uiSelectContent>
        <div [uiSelectItem]="'one'" label="One" data-option="open-one">One</div>
      </div>
      <button uiSelectTrigger id="author-open-trigger" aria-label="Open order">Open order</button>
    </div>
    <div uiSelect data-testid="open-shape" defaultValue="one" [defaultOpen]="true">
      <button uiSelectTrigger id="author-shape-trigger" aria-label="Open shape">Open shape</button>
      <div uiSelectContent>
        <div [uiSelectItem]="'one'" label="One" data-option="shape-one">One</div>
      </div>
    </div>
    <span data-testid="app-ready">open order</span>
  `,
})
export class OpenOrder {
  constructor() {
    startWindow("open-order", "open-shape");
  }
}
