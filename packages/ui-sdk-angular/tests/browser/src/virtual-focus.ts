import { Component, signal } from "@angular/core";
import {
  UiSelect,
  UiSelectContent,
  UiSelectItem,
  UiSelectTrigger,
  UiSelectValue,
} from "@loozo/ui-sdk-angular/select";

/** A Select that keeps focus on its trigger while open, beside one that moves focus into the list. */
@Component({
  selector: "app-virtual-focus",
  imports: [UiSelect, UiSelectTrigger, UiSelectValue, UiSelectContent, UiSelectItem],
  template: `
    @for (mode of modes; track mode.id) {
      <div
        uiSelect
        [attr.data-testid]="mode.id"
        [virtualFocus]="mode.virtual"
        [(value)]="mode.value"
      >
        <button uiSelectTrigger [attr.aria-label]="mode.id">
          <span uiSelectValue #shown="uiSelectValue">{{ shown.state().label }}</span>
        </button>
        <div uiSelectContent>
          @for (fruit of fruits; track fruit) {
            <div [uiSelectItem]="fruit" [label]="fruit" [attr.data-option]="fruit">{{ fruit }}</div>
          }
        </div>
      </div>
      <output [attr.data-testid]="mode.id + '-value'">{{ mode.value() }}</output>
    }
  `,
})
export class VirtualFocus {
  protected readonly fruits = ["apple", "banana", "cherry"];
  protected readonly modes = [
    { id: "virtual", virtual: true, value: signal<string | null>(null) },
    { id: "roving", virtual: false, value: signal<string | null>(null) },
  ];
}
