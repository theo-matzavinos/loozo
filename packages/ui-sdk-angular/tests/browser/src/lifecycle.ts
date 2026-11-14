import { Component, signal } from "@angular/core";
import {
  UiSelect,
  UiSelectContent,
  UiSelectItem,
  UiSelectTrigger,
  UiSelectValue,
} from "@loozo/ui-sdk-angular/select";

type Country = { code: string; name: string };

/** Object values, a Select created after hydration, and one destroyed while open. */
@Component({
  selector: "app-lifecycle",
  imports: [UiSelect, UiSelectTrigger, UiSelectValue, UiSelectContent, UiSelectItem],
  template: `
    <div
      uiSelect
      data-testid="objects"
      [itemToValue]="toKey"
      [itemToLabel]="toLabel()"
      (valueChange)="country.set($event)"
    >
      <button uiSelectTrigger aria-label="Country">
        <span uiSelectValue #shown="uiSelectValue">{{ shown.state().label }}</span>
      </button>
      <div uiSelectContent>
        @for (option of countries; track option.code) {
          <div [uiSelectItem]="option" [attr.data-option]="option.code">{{ option.name }}</div>
        }
      </div>
    </div>
    <output data-testid="country">{{ country()?.name ?? "none" }}</output>
    <button data-testid="relabel-countries" (click)="relabelCountries()">Relabel countries</button>

    <button data-testid="create-late" (click)="late.set(true)">Create</button>
    @if (late()) {
      <div uiSelect data-testid="late" defaultValue="one">
        <button uiSelectTrigger aria-label="Late">
          <span uiSelectValue #lateValue="uiSelectValue">{{ lateValue.state().value }}</span>
        </button>
        <div uiSelectContent>
          <div [uiSelectItem]="'one'" label="One" data-option="late-one">One</div>
          <div [uiSelectItem]="'two'" label="Two" data-option="late-two">Two</div>
        </div>
      </div>
    }

    <!-- The open popup is modal, so the removal comes from a timer, not a press outside it. -->
    <button data-testid="destroy-soon" (click)="destroySoon()">Destroy in 500 ms</button>
    @if (kept()) {
      <div uiSelect data-testid="doomed">
        <button uiSelectTrigger aria-label="Doomed">Doomed</button>
        <div uiSelectContent>
          <div [uiSelectItem]="'gone'" label="Gone" data-option="gone">Gone</div>
        </div>
      </div>
    }
  `,
})
export class Lifecycle {
  protected readonly countries: Country[] = [
    { code: "gr", name: "Greece" },
    { code: "fr", name: "France" },
  ];
  protected readonly country = signal<Country | null>(null);
  protected readonly late = signal(false);
  protected readonly kept = signal(true);

  protected destroySoon(): void {
    setTimeout(() => this.kept.set(false), 500);
  }

  protected toKey(country: Country): string {
    return country.code;
  }

  protected readonly toLabel = signal((country: Country) => country.name);

  // Only the root's `itemToLabel` changes: no item, key or store field does.
  protected relabelCountries(): void {
    this.toLabel.set((country) => `New ${country.name}`);
  }
}
