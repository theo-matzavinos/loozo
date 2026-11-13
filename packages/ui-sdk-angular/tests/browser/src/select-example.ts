import { Component, signal } from "@angular/core";
import {
  UiSelect,
  UiSelectContent,
  UiSelectItem,
  UiSelectTrigger,
  UiSelectValue,
} from "@loozo/ui-sdk-angular/select";
import { AppReadyProbe, AppTriggerProbe, startWindow } from "./probe";
import { renderedFlag } from "./ready";

type Fruit = { value: string; label: string; disabled: boolean };

/**
 * The fruit Select (trigger before content, an authored id, label and style) and the order Select
 * (content before an authored-id trigger, D19's out-of-shape order).
 */
@Component({
  selector: "app-select-example",
  // The probes come first, so their listeners run before the package's.
  imports: [
    AppTriggerProbe,
    AppReadyProbe,
    UiSelect,
    UiSelectTrigger,
    UiSelectValue,
    UiSelectContent,
    UiSelectItem,
  ],
  template: `
    <div
      uiSelect
      appReadyProbe="fruit"
      data-testid="fruit"
      defaultValue="apple"
      [loop]="true"
      [dismissible]="true"
    >
      <button uiSelectTrigger appTriggerProbe="fruit" aria-label="Fruit" id="author-fruit-trigger">
        Fruit: <span uiSelectValue #shown="uiSelectValue">{{ shown.state().value }}</span>
      </button>
      <div uiSelectContent [style.color]="'rgb(120, 180, 240)'">
        @for (option of options(); track $index) {
          <div
            [uiSelectItem]="option.value"
            [label]="option.label"
            [disabled]="option.disabled"
            [attr.data-option]="option.value"
          >
            {{ option.label }}
          </div>
        }
      </div>
      <output data-testid="value">{{ shown.state().value }}</output>
      <output data-testid="label">{{ shown.state().label }}</output>
    </div>
    <div uiSelect data-testid="order" defaultValue="one">
      <div uiSelectContent>
        <div [uiSelectItem]="'one'" label="One" data-option="order-one">One</div>
      </div>
      <button uiSelectTrigger id="author-order-trigger" aria-label="Order">Order</button>
    </div>
    <button data-testid="disable-banana" (click)="disableBanana()">Disable banana</button>
    <button data-testid="relabel-banana" (click)="relabelBanana()">Relabel banana</button>
    <button data-testid="swap-cherry" (click)="swapCherry()">Swap cherry</button>
    <span data-testid="select-ready" [attr.data-ready]="ready()">Select example</span>
  `,
})
export class SelectExample {
  protected readonly options = signal<Fruit[]>([
    { value: "apple", label: "Apple", disabled: false },
    { value: "banana", label: "Banana", disabled: false },
    { value: "cherry", label: "Cherry", disabled: false },
  ]);
  protected readonly ready = renderedFlag();

  constructor() {
    startWindow("fruit", "order");
  }

  protected disableBanana(): void {
    this.update("banana", (option) => ({ ...option, disabled: true }));
  }

  protected relabelBanana(): void {
    this.update("banana", (option) => ({ ...option, label: "Ripe banana" }));
  }

  // Same index, new value: with `track $index` the element is kept and gets a new part.
  protected swapCherry(): void {
    this.update("cherry", () => ({ value: "date", label: "Date", disabled: false }));
  }

  private update(value: string, change: (option: Fruit) => Fruit): void {
    const next: Fruit[] = [];

    for (const option of this.options()) {
      if (option.value === value) {
        next.push(change(option));
        continue;
      }

      next.push(option);
    }

    this.options.set(next);
  }
}
