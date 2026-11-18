import { Component, signal } from "@angular/core";
import type { UiSdkEvent } from "@loozo/ui-sdk-angular";
import { UiCheckbox, UiCheckboxInput } from "@loozo/ui-sdk-angular/checkbox";
import { UiRadio, UiRadioGroup } from "@loozo/ui-sdk-angular/radio";
import { UiSwitch } from "@loozo/ui-sdk-angular/switch";
import type { CheckboxOptions, CheckedState } from "@ui-sdk/core/checkbox";
import type { RadioGroupOptions } from "@ui-sdk/core/radio";
import { AppCheckbox } from "./app-checkbox";
import { renderedFlag } from "./ready";

type CheckedRequest = UiSdkEvent<NonNullable<CheckboxOptions["onCheckedChange"]>>;
type Level = "low" | "mid" | "high";
type LevelRequest = UiSdkEvent<NonNullable<RadioGroupOptions<Level>["onValueChange"]>>;

/** Controlled, vetoed and disabled Checkbox (direct and composed), Switch and RadioGroup. */
@Component({
  selector: "app-form-controls",
  imports: [UiCheckbox, UiCheckboxInput, AppCheckbox, UiSwitch, UiRadioGroup, UiRadio],
  template: `
    @for (variant of variants; track variant) {
      <section [attr.data-testid]="variant">
        @if (variant === "checkbox") {
          <button
            uiCheckbox
            data-testid="controlled"
            [(checked)]="checkbox"
            aria-label="Controlled"
          ></button>
          <button
            uiCheckbox
            data-testid="vetoed"
            (checkedChangeRequest)="veto($event)"
            (checkedChange)="count()"
            aria-label="Vetoed"
          ></button>
          <button
            uiCheckbox
            data-testid="disabled"
            [disabled]="true"
            aria-label="Disabled"
          ></button>
        } @else if (variant === "composed") {
          <button
            appCheckbox
            data-testid="controlled"
            [(checked)]="composed"
            aria-label="Controlled"
          ></button>
          <button
            appCheckbox
            data-testid="vetoed"
            (checkedChangeRequest)="veto($event)"
            (checkedChange)="count()"
            aria-label="Vetoed"
          ></button>
          <button
            appCheckbox
            data-testid="disabled"
            [disabled]="true"
            aria-label="Disabled"
          ></button>
        } @else {
          <button
            uiSwitch
            data-testid="controlled"
            [(checked)]="switchOn"
            aria-label="Controlled"
          ></button>
          <button
            uiSwitch
            data-testid="vetoed"
            (checkedChangeRequest)="veto($event)"
            (checkedChange)="count()"
            aria-label="Vetoed"
          ></button>
          <button uiSwitch data-testid="disabled" [disabled]="true" aria-label="Disabled"></button>
        }
      </section>
    }
    <output data-testid="checkbox-value">{{ checkbox() }}</output>
    <button
      data-testid="checkbox-set"
      (click)="checkbox.set(checkbox() === true ? 'indeterminate' : true)"
    >
      Set
    </button>
    <output data-testid="composed-value">{{ composed() }}</output>
    <button
      data-testid="composed-set"
      (click)="composed.set(composed() === true ? 'indeterminate' : true)"
    >
      Set
    </button>
    <output data-testid="switch-value">{{ switchOn() }}</output>
    <button data-testid="switch-set" (click)="switchOn.set(!switchOn())">Set</button>
    <output data-testid="changes">{{ changes() }}</output>

    <div
      uiRadioGroup
      data-testid="level"
      [(value)]="level"
      [loop]="false"
      (valueChangeRequest)="guard($event)"
      aria-label="Level"
    >
      <button uiRadio value="low" data-testid="level-low">Low</button>
      <button uiRadio value="mid" data-testid="level-mid" [disabled]="true">Mid</button>
      <button uiRadio value="high" data-testid="level-high">High</button>
    </div>
    <output data-testid="level-value">{{ level() ?? "null" }}</output>
    <button data-testid="level-clear" (click)="level.set(null)">Clear</button>
    <output data-testid="level-requests">{{ requests() }} {{ lastRequest() ?? "null" }}</output>

    <div uiRadioGroup data-testid="wrap" defaultValue="one" aria-label="Wrap">
      <button uiRadio value="one" data-testid="wrap-one">One</button>
      <button uiRadio value="two" data-testid="wrap-two">Two</button>
    </div>
    <div
      uiRadioGroup
      data-testid="locked"
      defaultValue="one"
      (valueChangeRequest)="$event.details.cancel()"
      aria-label="Locked"
    >
      <button uiRadio value="one" data-testid="locked-one">One</button>
      <button uiRadio value="two" data-testid="locked-two">Two</button>
    </div>

    <form data-testid="fieldset-form">
      <fieldset data-testid="fieldset" [disabled]="fieldsetDisabled()">
        <button
          uiCheckbox
          #fenced="uiCheckbox"
          data-testid="fenced"
          name="fenced"
          [defaultChecked]="true"
          aria-label="Fenced"
        ></button>
        <input [uiCheckboxInput]="fenced" />
      </fieldset>
    </form>
    <button data-testid="fieldset-toggle" (click)="fieldsetDisabled.set(!fieldsetDisabled())">
      Toggle fieldset
    </button>

    <span data-testid="app-ready" [attr.data-ready]="ready()">form controls</span>
  `,
})
export class FormControls {
  protected readonly variants = ["checkbox", "composed", "switch"] as const;
  protected readonly checkbox = signal<CheckedState>(false);
  protected readonly composed = signal<CheckedState>(false);
  protected readonly switchOn = signal(false);
  protected readonly changes = signal(0);
  protected readonly level = signal<Level | null>("low");
  protected readonly requests = signal(0);
  protected readonly lastRequest = signal<Level | null>(null);
  protected readonly fieldsetDisabled = signal(true);
  protected readonly ready = renderedFlag();

  protected veto({ details }: CheckedRequest): void {
    details.cancel();
  }

  protected count(): void {
    this.changes.set(this.changes() + 1);
  }

  protected guard({ value }: LevelRequest): void {
    this.requests.set(this.requests() + 1);
    this.lastRequest.set(value);
  }
}
