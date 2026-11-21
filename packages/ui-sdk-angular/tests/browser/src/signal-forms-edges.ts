import { JsonPipe } from "@angular/common";
import { Component, signal } from "@angular/core";
import { FormField, form } from "@angular/forms/signals";
import { UiCheckbox, UiCheckboxInput } from "@loozo/ui-sdk-angular/checkbox";
import { UiRadio, UiRadioGroup } from "@loozo/ui-sdk-angular/radio";
import {
  UiSelect,
  UiSelectContent,
  UiSelectFormInput,
  UiSelectItem,
  UiSelectTrigger,
} from "@loozo/ui-sdk-angular/select";
import { UiSwitch } from "@loozo/ui-sdk-angular/switch";
import { createCheckboxController } from "@ui-sdk/core/checkbox";
import { renderedFlag } from "./ready";

// The documented Signal Forms caveats (plan D5, D6, D10), pinned so a change in Angular or core
// that alters them fails loudly. Each is its own route, since two of them warn on purpose.

/** D6: `undefined` field values leave core uncontrolled; returning to `undefined` warns. */
@Component({
  selector: "app-signal-forms-undefined",
  imports: [
    JsonPipe,
    FormField,
    UiCheckbox,
    UiSwitch,
    UiRadioGroup,
    UiRadio,
    UiSelect,
    UiSelectTrigger,
    UiSelectContent,
    UiSelectItem,
  ],
  template: `
    <button
      uiCheckbox
      data-testid="undefined-checkbox"
      aria-label="Checkbox"
      [formField]="checkboxField"
      [defaultChecked]="true"
    ></button>
    <button
      uiSwitch
      data-testid="undefined-switch"
      aria-label="Switch"
      [formField]="switchField"
      [defaultChecked]="true"
    ></button>
    <div uiRadioGroup aria-label="Radio" [formField]="radioField" defaultValue="a">
      <button uiRadio value="a" data-testid="undefined-radio">A</button>
    </div>
    <div uiSelect [formField]="selectField" defaultValue="a">
      <button uiSelectTrigger aria-label="Select">Select</button>
      <div uiSelectContent>
        <div [uiSelectItem]="'a'" label="A" data-testid="undefined-select-a">A</div>
      </div>
    </div>
    <button data-testid="defined" (click)="define()">Defined</button>
    <button data-testid="undefined" (click)="undefine()">Undefined</button>
    <output data-testid="undefined-flags">{{ undefinedFlags() | json }}</output>
    <span data-testid="app-ready" [attr.data-ready]="ready()">ready</span>
  `,
})
export class SignalFormsUndefined {
  protected readonly checkbox = signal<boolean | undefined>(undefined);
  protected readonly checkboxField = form(this.checkbox);
  protected readonly switch = signal<boolean | undefined>(undefined);
  protected readonly switchField = form(this.switch);
  protected readonly radio = signal<string | null | undefined>(undefined);
  protected readonly radioField = form(this.radio);
  protected readonly select = signal<string | null | undefined>(undefined);
  protected readonly selectField = form(this.select);
  protected readonly ready = renderedFlag();

  protected undefinedFlags(): boolean[] {
    return [
      this.checkbox() === undefined,
      this.switch() === undefined,
      this.radio() === undefined,
      this.select() === undefined,
    ];
  }

  protected define(): void {
    this.checkbox.set(false);
    this.switch.set(false);
    this.radio.set(null);
    this.select.set(null);
  }

  protected undefine(): void {
    this.checkbox.set(undefined);
    this.switch.set(undefined);
    this.radio.set(undefined);
    this.select.set(undefined);
  }
}

/** D5: a controller can put `"indeterminate"` into a field typed `boolean`. */
@Component({
  selector: "app-signal-forms-boolean",
  imports: [JsonPipe, FormField, UiCheckbox],
  template: `
    <button
      uiCheckbox
      data-testid="boolean-checkbox"
      aria-label="Boolean"
      [formField]="f"
      [controller]="controller"
    ></button>
    <button data-testid="set-indeterminate" (click)="controller.setChecked('indeterminate')">
      Set indeterminate
    </button>
    <output data-testid="model">{{ model() | json }}</output>
    <span data-testid="app-ready" [attr.data-ready]="ready()">ready</span>
  `,
})
export class SignalFormsBoolean {
  protected readonly controller = createCheckboxController();
  protected readonly model = signal(false);
  protected readonly f = form(this.model);
  protected readonly ready = renderedFlag();
}

/** D10: `[formField]` on a hidden input binds the input natively, not the visible control. */
@Component({
  selector: "app-signal-forms-hidden",
  imports: [
    JsonPipe,
    FormField,
    UiCheckbox,
    UiCheckboxInput,
    UiSelect,
    UiSelectTrigger,
    UiSelectContent,
    UiSelectItem,
    UiSelectFormInput,
  ],
  template: `
    <form>
      <button
        uiCheckbox
        #terms="uiCheckbox"
        data-testid="hidden-checkbox"
        name="terms"
        aria-label="Terms"
      ></button>
      <input
        type="checkbox"
        [uiCheckboxInput]="terms"
        [formField]="f.terms"
        data-testid="hidden-checkbox-input"
      />
      <div uiSelect name="fruit" data-testid="hidden-select">
        <button uiSelectTrigger aria-label="Fruit">Fruit</button>
        <div uiSelectContent>
          <div [uiSelectItem]="'apple'" label="Apple" data-testid="hidden-apple">Apple</div>
        </div>
        <textarea
          uiSelectFormInput
          [formField]="f.fruit"
          data-testid="hidden-select-input"
        ></textarea>
      </div>
    </form>
    <button data-testid="external" (click)="model.set({ terms: false, fruit: '' })">
      model.set
    </button>
    <output data-testid="model">{{ model() | json }}</output>
    <span data-testid="app-ready" [attr.data-ready]="ready()">ready</span>
  `,
})
export class SignalFormsHidden {
  protected readonly model = signal({ terms: false, fruit: "" });
  protected readonly f = form(this.model);
  protected readonly ready = renderedFlag();
}
