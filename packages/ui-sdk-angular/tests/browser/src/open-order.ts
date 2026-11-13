import { Component } from "@angular/core";
import {
  UiSelect,
  UiSelectContent,
  UiSelectItem,
  UiSelectTrigger,
} from "@loozo/ui-sdk-angular/select";
import { startWindow } from "./probe";

/** A Select that starts open with its content before an authored-id trigger (D19, C21). */
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
    <span data-testid="app-ready">open order</span>
  `,
})
export class OpenOrder {
  constructor() {
    startWindow("open-order");
  }
}
