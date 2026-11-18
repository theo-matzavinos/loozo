import { Component } from "@angular/core";
import { UiCheckbox, UiCheckboxInput } from "@loozo/ui-sdk-angular/checkbox";
import { UiRadio, UiRadioGroup, UiRadioInput } from "@loozo/ui-sdk-angular/radio";
import { UiSwitch, UiSwitchInput } from "@loozo/ui-sdk-angular/switch";

/** Form controls with their inputs inside one hydrate-on-interaction block (incremental only). */
@Component({
  selector: "app-forms-defer",
  imports: [
    UiCheckbox,
    UiCheckboxInput,
    UiSwitch,
    UiSwitchInput,
    UiRadioGroup,
    UiRadio,
    UiRadioInput,
  ],
  template: `
    <form data-testid="defer-form">
      @defer (hydrate on interaction) {
        <button
          uiCheckbox
          #late="uiCheckbox"
          data-testid="late-checkbox"
          name="lateCheckbox"
          aria-label="Late checkbox"
        ></button>
        <input [uiCheckboxInput]="late" />
        <button
          uiSwitch
          #lateSwitch="uiSwitch"
          data-testid="late-switch"
          name="lateSwitch"
          aria-label="Late switch"
        ></button>
        <input [uiSwitchInput]="lateSwitch" />
        <div uiRadioGroup name="lateRadio" aria-label="Late radio">
          <button uiRadio #a="uiRadio" value="a" data-testid="late-radio-a">A</button>
          <input [uiRadioInput]="a" />
          <button uiRadio #b="uiRadio" value="b" data-testid="late-radio-b">B</button>
          <input [uiRadioInput]="b" />
        </div>
      }
    </form>
    <span data-testid="app-ready">forms defer</span>
  `,
})
export class FormsDefer {}
