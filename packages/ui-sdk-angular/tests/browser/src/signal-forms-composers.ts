import { JsonPipe } from "@angular/common";
import { Component, signal } from "@angular/core";
import { FormField, disabled, form, readonly } from "@angular/forms/signals";
import { UiCheckbox } from "@loozo/ui-sdk-angular/checkbox";
import {
  UiSelect,
  UiSelectContent,
  UiSelectItem,
  UiSelectTrigger,
} from "@loozo/ui-sdk-angular/select";
import { AppCheckbox } from "./app-checkbox";
import { AppCountry, type Country, countries } from "./app-country";
import { renderedFlag } from "./ready";

/**
 * `[formField]` on hostDirectives composers (case 8), and on a plain Checkbox and Select with no
 * hidden inputs, which submit through JavaScript and so must not warn about a missing input
 * (case 9, D8).
 */
@Component({
  selector: "app-signal-forms-composers",
  imports: [
    JsonPipe,
    FormField,
    AppCheckbox,
    AppCountry,
    UiCheckbox,
    UiSelect,
    UiSelectTrigger,
    UiSelectContent,
    UiSelectItem,
  ],
  template: `
    <button appCheckbox data-testid="composed-agree" aria-label="Agree" [formField]="f.agree"></button>
    <app-country
      data-testid="composed-country"
      [formField]="f.country"
      [items]="countryItems"
      [itemToValue]="key"
      [itemToLabel]="label"
    />
    <button uiCheckbox data-testid="plain-news" aria-label="News" [formField]="f.news"></button>
    <div uiSelect data-testid="plain-fruit" [formField]="f.fruit">
      <button uiSelectTrigger aria-label="Fruit">Fruit</button>
      <div uiSelectContent>
        <div [uiSelectItem]="'apple'" label="Apple" data-testid="plain-fruit-apple">Apple</div>
      </div>
    </div>
    <input data-testid="composers-outside" aria-label="Outside" />
    <button data-testid="composers-disabled" (click)="isDisabled.set(!isDisabled())">Disabled</button>
    <button data-testid="composers-readonly" (click)="isReadonly.set(!isReadonly())">Readonly</button>
    <button data-testid="composers-external" (click)="external()">model.set</button>
    <button data-testid="focus-composed-country" (click)="f.country().focusBoundControl()">
      Focus country
    </button>
    <output data-testid="composers-model">{{ model() | json }}</output>
    <output data-testid="composers-touched">{{ touched() | json }}</output>
    <span data-testid="app-ready" [attr.data-ready]="ready()">ready</span>
  `,
})
export class SignalFormsComposers {
  protected readonly countryItems = countries.map((value) => ({ value, label: value.label }));
  protected readonly key = (country: Country) => country.id;
  protected readonly label = (country: Country) => country.label;
  protected readonly model = signal({
    agree: false,
    country: null as Country | null,
    news: false,
    fruit: null as string | null,
  });
  protected readonly isDisabled = signal(false);
  protected readonly isReadonly = signal(false);
  protected readonly f = form(this.model, (path) => {
    disabled(path.agree, () => this.isDisabled());
    readonly(path.agree, () => this.isReadonly());
    disabled(path.country, () => this.isDisabled());
    readonly(path.country, () => this.isReadonly());
  });
  protected readonly ready = renderedFlag();

  protected touched(): boolean[] {
    return [this.f.agree().touched(), this.f.country().touched()];
  }

  protected external(): void {
    this.model.update((values) => ({ ...values, agree: true, country: countries[1]! }));
  }
}
