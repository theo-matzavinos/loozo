import { Component, signal } from "@angular/core";
import { FormField, form } from "@angular/forms/signals";
import { UiCheckbox } from "@loozo/ui-sdk-angular/checkbox";
import { UiRadioGroup } from "@loozo/ui-sdk-angular/radio";
import { UiSelect } from "@loozo/ui-sdk-angular/select";
import { UiSwitch } from "@loozo/ui-sdk-angular/switch";

type Item = { id: string };

/**
 * Compile-only: the field value types `[formField]` accepts on each root under strictTemplates.
 * The fixture build fails if one stops compiling. Routed only so the build includes it.
 */
@Component({
  selector: "app-signal-forms-types",
  imports: [FormField, UiCheckbox, UiSwitch, UiRadioGroup, UiSelect],
  template: `
    <button uiCheckbox aria-label="Boolean" [formField]="f.boolean"></button>
    <button uiCheckbox aria-label="Tri-state" [formField]="f.triState"></button>
    <button uiSwitch aria-label="Boolean" [formField]="f.boolean"></button>
    <div uiRadioGroup aria-label="String" [formField]="f.text"></div>
    <div uiRadioGroup aria-label="Literal" [formField]="f.literal"></div>
    <div uiSelect [formField]="f.text"></div>
    <div uiSelect [formField]="f.item" [itemToValue]="key"></div>
  `,
})
export class SignalFormsTypes {
  protected readonly key = (item: Item) => item.id;
  protected readonly f = form(
    signal({
      boolean: false,
      triState: "indeterminate" as boolean | "indeterminate",
      text: null as string | null,
      literal: null as "s" | "l" | null,
      item: null as Item | null,
    }),
  );
}
