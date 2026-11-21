import { Component, signal } from "@angular/core";
import { UiCheckbox, UiCheckboxInput } from "@loozo/ui-sdk-angular/checkbox";
import { UiRadio, UiRadioGroup } from "@loozo/ui-sdk-angular/radio";
import { UiSelect, UiSelectFormInput, UiSelectTrigger } from "@loozo/ui-sdk-angular/select";
import { UiSwitch } from "@loozo/ui-sdk-angular/switch";

/**
 * Decision W, narrowed by D8: a control with a static `name` and no input warns once in
 * development; one with its input, an unnamed one and one with a bound `[name]` don't; a Select's
 * form part on the wrong tag counts as missing.
 */
@Component({
  selector: "app-form-warnings",
  imports: [
    UiCheckbox,
    UiCheckboxInput,
    UiSwitch,
    UiRadioGroup,
    UiRadio,
    UiSelect,
    UiSelectTrigger,
    UiSelectFormInput,
  ],
  template: `
    <button data-testid="show" (click)="shown.set(true)">Show</button>
    @if (shown()) {
      <button uiCheckbox name="lonely-checkbox" aria-label="Lonely"></button>
      <button uiSwitch name="lonely-switch" aria-label="Lonely"></button>
      <div uiRadioGroup name="lonely-radio" aria-label="Lonely">
        <button uiRadio value="one">One</button>
      </div>
      <div uiSelect name="lonely-select">
        <button uiSelectTrigger aria-label="Lonely">Lonely</button>
      </div>
      <div uiSelect name="wrong-tag-select">
        <button uiSelectTrigger aria-label="Wrong tag">Wrong tag</button>
        <input uiSelectFormInput />
      </div>
      <div uiSelect name="paired-select">
        <button uiSelectTrigger aria-label="Paired select">Paired select</button>
        <textarea uiSelectFormInput></textarea>
      </div>
      <button uiCheckbox #paired="uiCheckbox" name="paired" aria-label="Paired"></button>
      <input [uiCheckboxInput]="paired" />
      <button uiCheckbox aria-label="Unnamed"></button>
      <button uiCheckbox [name]="boundName" aria-label="Bound name"></button>
      <span data-testid="shown">shown</span>
    }
  `,
})
export class FormWarnings {
  protected readonly shown = signal(false);
  protected readonly boundName = "bound-checkbox";
}
