import { Component, inject } from "@angular/core";
import {
  UiSelect,
  UiSelectContent,
  UiSelectItem,
  UiSelectTrigger,
  UiSelectValue,
} from "@loozo/ui-sdk-angular/select";

export type Country = { id: string; label: string };

export const countries: Country[] = [
  { id: "gr", label: "Greece" },
  { id: "fr", label: "France" },
];

/**
 * A consumer's own country select, composed through `hostDirectives` and ready for Signal Forms:
 * it exposes the inputs `[formField]` writes and `touch`, and forwards `focus()`, which Angular
 * calls on the composer rather than on UiSelect.
 */
@Component({
  selector: "app-country",
  imports: [UiSelectTrigger, UiSelectValue, UiSelectContent, UiSelectItem],
  hostDirectives: [
    {
      directive: UiSelect,
      inputs: [
        "value",
        "disabled",
        "readonly",
        "required",
        "name",
        "items",
        "itemToValue",
        "itemToLabel",
      ],
      outputs: ["valueChange", "touch"],
    },
  ],
  template: `
    <button uiSelectTrigger aria-label="Composed country" data-testid="composed-country-trigger">
      <span uiSelectValue #shown="uiSelectValue">{{ shown.state().label || "Pick one" }}</span>
    </button>
    <div uiSelectContent>
      @for (country of countries; track country.id) {
        <div
          [uiSelectItem]="country"
          [label]="country.label"
          [attr.data-testid]="'composed-country-' + country.id"
        >
          {{ country.label }}
        </div>
      }
    </div>
  `,
})
export class AppCountry {
  protected readonly countries = countries;
  readonly #select = inject<UiSelect<Country>>(UiSelect);

  focus(options?: FocusOptions): void {
    this.#select.focus(options);
  }
}
