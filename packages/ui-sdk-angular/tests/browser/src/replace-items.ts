import { Component, signal } from "@angular/core";
import {
  UiSelect,
  UiSelectContent,
  UiSelectItem,
  UiSelectTrigger,
  UiSelectValue,
} from "@loozo/ui-sdk-angular/select";

type Option = { readonly key: string };

function batch(number: number): Option[] {
  return [{ key: `b${number}-one` }, { key: `b${number}-two` }, { key: `b${number}-three` }];
}

/** One Select kept alive while its item list is replaced by items with new keys. */
@Component({
  selector: "app-replace-items",
  imports: [UiSelect, UiSelectTrigger, UiSelectValue, UiSelectContent, UiSelectItem],
  template: `
    <div uiSelect data-testid="replaced" (valueChange)="picked.set($event)">
      <button uiSelectTrigger aria-label="Batch">
        <span uiSelectValue #shown="uiSelectValue">{{ shown.state().label }}</span>
      </button>
      <div uiSelectContent>
        @for (option of options(); track option.key) {
          <div [uiSelectItem]="option.key" [label]="option.key" [attr.data-option]="option.key">
            {{ option.key }}
          </div>
        }
      </div>
    </div>
    <button data-testid="replace" (click)="replace()">Replace</button>
    <output data-testid="picked">{{ picked() ?? "none" }}</output>
  `,
})
export class ReplaceItems {
  #batch = 0;
  protected readonly options = signal(batch(0));
  protected readonly picked = signal<string | null>(null);

  protected replace(): void {
    this.#batch += 1;
    this.options.set(batch(this.#batch));
  }
}
