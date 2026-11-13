import { Component } from "@angular/core";
import {
  UiSelect,
  UiSelectContent,
  UiSelectItem,
  UiSelectTrigger,
  UiSelectValue,
} from "@loozo/ui-sdk-angular/select";

/** Two Selects on one page, the second in a client `@defer` block (defer.incremental.ts hydrates it on interaction). */
@Component({
  selector: "app-defer",
  imports: [UiSelect, UiSelectTrigger, UiSelectValue, UiSelectContent, UiSelectItem],
  template: `
    <div uiSelect data-testid="outside" defaultValue="red">
      <button uiSelectTrigger aria-label="Colour">
        <span uiSelectValue #colour="uiSelectValue">{{ colour.state().value }}</span>
      </button>
      <div uiSelectContent>
        <div [uiSelectItem]="'red'" label="Red" data-option="red">Red</div>
        <div [uiSelectItem]="'blue'" label="Blue" data-option="blue">Blue</div>
      </div>
    </div>
    @defer (on idle) {
      <div uiSelect data-testid="inside" defaultValue="small">
        <button uiSelectTrigger aria-label="Size">
          <span uiSelectValue #size="uiSelectValue">{{ size.state().value }}</span>
        </button>
        <div uiSelectContent>
          <div [uiSelectItem]="'small'" label="Small" data-option="small">Small</div>
          <div [uiSelectItem]="'large'" label="Large" data-option="large">Large</div>
        </div>
      </div>
    }
  `,
})
export class Defer {}
