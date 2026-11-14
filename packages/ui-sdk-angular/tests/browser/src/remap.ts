import { Component, signal } from "@angular/core";
import {
  UiSelect,
  UiSelectContent,
  UiSelectItem,
  UiSelectTrigger,
  UiSelectValue,
} from "@loozo/ui-sdk-angular/select";

function plain(value: string): string {
  return value;
}

function prefixed(value: string): string {
  return `new-${value}`;
}

/**
 * One Select whose item list stays while only its `itemToValue` is replaced. Each item shows its
 * own `state().selected` from a template binding, which Angular reads before running effects.
 */
@Component({
  selector: "app-remap",
  imports: [UiSelect, UiSelectTrigger, UiSelectValue, UiSelectContent, UiSelectItem],
  template: `
    <div
      uiSelect
      data-testid="remapped"
      defaultValue="a"
      [itemToValue]="mapping()"
      (valueChange)="picked.set($event)"
    >
      <button uiSelectTrigger aria-label="Letter">
        <span uiSelectValue #shown="uiSelectValue">{{ shown.state().label }}</span>
      </button>
      <div uiSelectContent>
        <div [uiSelectItem]="'a'" label="A" data-option="a" #itemA="uiSelectItem">
          A <span data-mark>{{ itemA.state().selected }}</span>
        </div>
        <div [uiSelectItem]="'b'" label="B" data-option="b" #itemB="uiSelectItem">
          B <span data-mark>{{ itemB.state().selected }}</span>
        </div>
      </div>
    </div>
    <button data-testid="remap" (click)="mapping.set(prefixed)">Remap</button>
    <output data-testid="picked">{{ picked() ?? "none" }}</output>
  `,
})
export class Remap {
  protected readonly mapping = signal(plain);
  protected readonly prefixed = prefixed;
  protected readonly picked = signal<string | null>(null);
}
