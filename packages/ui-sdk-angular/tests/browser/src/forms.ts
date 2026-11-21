import { Component } from "@angular/core";
import { UiCheckbox, UiCheckboxIndicator, UiCheckboxInput } from "@loozo/ui-sdk-angular/checkbox";
import { UiRadio, UiRadioGroup, UiRadioIndicator, UiRadioInput } from "@loozo/ui-sdk-angular/radio";
import {
  UiSelect,
  UiSelectContent,
  UiSelectFormInput,
  UiSelectItem,
  UiSelectTrigger,
} from "@loozo/ui-sdk-angular/select";
import { UiSwitch, UiSwitchInput, UiSwitchThumb } from "@loozo/ui-sdk-angular/switch";
import { AppCheckbox } from "./app-checkbox";
import { startWindow } from "./probe";
import { renderedFlag } from "./ready";

/**
 * Native form participation (D14-B): every control's hidden input, written by the author, in one
 * form with a reset button; an input written before its checkbox; an indeterminate checkbox; a
 * checkbox outside the form that joins it by `form`; a composed checkbox; a second form whose
 * controls are all required and empty; and a form with one text field, a Select and no submit
 * button. `data-probe-instance` tells the observer which control a
 * sibling input belongs to.
 */
@Component({
  selector: "app-forms",
  imports: [
    UiCheckbox,
    UiCheckboxIndicator,
    UiCheckboxInput,
    UiSwitch,
    UiSwitchThumb,
    UiSwitchInput,
    UiRadioGroup,
    UiRadio,
    UiRadioIndicator,
    UiRadioInput,
    UiSelect,
    UiSelectTrigger,
    UiSelectContent,
    UiSelectItem,
    UiSelectFormInput,
    AppCheckbox,
  ],
  template: `
    <form id="main-form" data-testid="main-form">
      <label>
        <button
          uiCheckbox
          #terms="uiCheckbox"
          data-testid="terms"
          name="terms"
          [defaultChecked]="true"
        >
          <span uiCheckboxIndicator data-testid="terms-indicator">✓</span>
        </button>
        <input [uiCheckboxInput]="terms" data-testid="terms-input" data-probe-instance="terms" />
        Accept the terms
      </label>

      <input [uiCheckboxInput]="news" data-testid="news-input" data-probe-instance="news" />
      <button
        uiCheckbox
        #news="uiCheckbox"
        data-testid="news"
        name="news"
        value="weekly"
        aria-label="News"
      ></button>

      <button
        uiCheckbox
        #partial="uiCheckbox"
        data-testid="partial"
        name="partial"
        defaultChecked="indeterminate"
        aria-label="Partial"
      >
        <span uiCheckboxIndicator data-testid="partial-indicator">–</span>
      </button>
      <input
        [uiCheckboxInput]="partial"
        data-testid="partial-input"
        data-probe-instance="partial"
      />

      <button uiSwitch #wifi="uiSwitch" data-testid="wifi" name="wifi" aria-label="Wi-Fi">
        <span uiSwitchThumb data-testid="wifi-thumb"></span>
      </button>
      <input [uiSwitchInput]="wifi" data-testid="wifi-input" data-probe-instance="wifi" />

      <div uiRadioGroup data-testid="size" name="size" defaultValue="m" aria-label="Size">
        @for (option of sizes; track option) {
          <button uiRadio #radio="uiRadio" [value]="option" [attr.data-testid]="'size-' + option">
            <span uiRadioIndicator [attr.data-testid]="'size-indicator-' + option"></span
            >{{ option }}
          </button>
          <input [uiRadioInput]="radio" [attr.data-testid]="'size-input-' + option" />
        }
      </div>

      <div uiSelect data-testid="fruit" name="fruit" defaultValue="pear" autoComplete="off">
        <button uiSelectTrigger aria-label="Fruit">Fruit</button>
        <div uiSelectContent>
          <div [uiSelectItem]="'apple'" label="Apple" data-option="apple">Apple</div>
          <div [uiSelectItem]="'pear'" label="Pear" data-option="pear">Pear</div>
        </div>
        <textarea uiSelectFormInput data-testid="fruit-input"></textarea>
      </div>

      <button
        appCheckbox
        #composed="uiCheckbox"
        data-testid="composed"
        name="composed"
        aria-label="Composed"
      ></button>
      <input
        [uiCheckboxInput]="composed"
        data-testid="composed-input"
        data-probe-instance="composed"
      />

      <button type="reset" data-testid="reset">Reset</button>
    </form>

    <button
      uiCheckbox
      #outside="uiCheckbox"
      data-testid="outside"
      name="outside"
      form="main-form"
      [defaultChecked]="true"
      aria-label="Outside"
    ></button>
    <input [uiCheckboxInput]="outside" data-testid="outside-input" data-probe-instance="outside" />

    <form data-testid="required-form">
      <button
        uiCheckbox
        #agree="uiCheckbox"
        data-testid="agree"
        name="agree"
        [required]="true"
        aria-label="Agree"
      ></button>
      <input [uiCheckboxInput]="agree" data-probe-instance="agree" />
      <button
        uiSwitch
        #alerts="uiSwitch"
        data-testid="alerts"
        name="alerts"
        [required]="true"
        aria-label="Alerts"
      ></button>
      <input [uiSwitchInput]="alerts" data-probe-instance="alerts" />
      <div uiRadioGroup data-testid="plan" name="plan" [required]="true" aria-label="Plan">
        <button uiRadio #free="uiRadio" value="free" data-testid="plan-free">Free</button>
        <input [uiRadioInput]="free" />
        <button uiRadio #paid="uiRadio" value="paid" data-testid="plan-paid">Paid</button>
        <input [uiRadioInput]="paid" />
      </div>
      <div uiSelect data-testid="colour" name="colour" [required]="true">
        <button uiSelectTrigger aria-label="Colour">Colour</button>
        <div uiSelectContent>
          <div [uiSelectItem]="'red'" label="Red" data-option="red">Red</div>
        </div>
        <textarea uiSelectFormInput data-testid="colour-input"></textarea>
      </div>
    </form>

    <form data-testid="enter-form" action="/forms">
      <input name="note" value="hello" data-testid="enter-note" />
      <div uiSelect data-testid="pick" name="pick" defaultValue="pear">
        <button type="button" uiSelectTrigger aria-label="Pick">Pick</button>
        <div uiSelectContent>
          <div [uiSelectItem]="'pear'" label="Pear">Pear</div>
          <div [uiSelectItem]="'apple'" label="Apple">Apple</div>
        </div>
        <textarea uiSelectFormInput data-testid="pick-input"></textarea>
      </div>
    </form>

    <span data-testid="app-ready" [attr.data-ready]="ready()">forms</span>
  `,
})
export class Forms {
  protected readonly sizes = ["s", "m", "l"];
  protected readonly ready = renderedFlag();

  constructor() {
    startWindow(
      "terms",
      "news",
      "partial",
      "wifi",
      "size",
      "fruit",
      "composed",
      "outside",
      "agree",
      "alerts",
      "plan",
      "colour",
      "pick",
    );
  }
}
