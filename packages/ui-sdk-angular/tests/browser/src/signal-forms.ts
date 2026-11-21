import { JsonPipe } from "@angular/common";
import { Component, signal } from "@angular/core";
import { FormField, disabled, form, readonly, required } from "@angular/forms/signals";
import { UiCheckbox, UiCheckboxInput } from "@loozo/ui-sdk-angular/checkbox";
import { UiRadio, UiRadioGroup, UiRadioInput } from "@loozo/ui-sdk-angular/radio";
import {
  UiSelect,
  UiSelectContent,
  UiSelectFormInput,
  UiSelectItem,
  UiSelectTrigger,
  UiSelectValue,
} from "@loozo/ui-sdk-angular/select";
import { UiSwitch, UiSwitchInput } from "@loozo/ui-sdk-angular/switch";
import { incremental } from "./mode";
import { AppEarlyFocus, AppReadyProbe, startWindow } from "./probe";
import { renderedFlag } from "./ready";

type Country = { id: string; label: string };

type Values = {
  terms: boolean | "indeterminate";
  wifi: boolean;
  size: string | null;
  fruit: string | null;
  country: Country | null;
};

const countries: Country[] = [
  { id: "gr", label: "Greece" },
  { id: "fr", label: "France" },
];

function initial(): Values {
  return { terms: true, wifi: true, size: "s", fruit: "apple", country: countries[0]! };
}

function alternate(): Values {
  return { terms: false, wifi: false, size: "l", fruit: "pear", country: countries[1]! };
}

/**
 * Signal Forms' `[formField]` on each root: Checkbox, Switch, RadioGroup, a string Select and an
 * object Select, with their hidden inputs in one native form, cancellation, Angular and native
 * resets, external writes and rule toggles. `?earlyFocus=1` moves focus around the controls and
 * calls `focus()` on the group and the object Select before their inputs are set (case 11).
 */
@Component({
  selector: "app-signal-forms",
  // The probes come first, so their constructors and hooks run before the package's.
  imports: [
    AppReadyProbe,
    AppEarlyFocus,
    JsonPipe,
    FormField,
    UiCheckbox,
    UiCheckboxInput,
    UiSwitch,
    UiSwitchInput,
    UiRadioGroup,
    UiRadio,
    UiRadioInput,
    UiSelect,
    UiSelectTrigger,
    UiSelectValue,
    UiSelectContent,
    UiSelectItem,
    UiSelectFormInput,
  ],
  template: `
    <span data-testid="hydrate">Signal forms</span>
    <form data-testid="native-form">
      <button
        uiCheckbox
        #terms="uiCheckbox"
        data-testid="terms"
        [formField]="f.terms"
        (checkedChangeRequest)="cancel($event)"
      >
        Terms
      </button>
      <input [uiCheckboxInput]="terms" data-testid="terms-input" />
      <button
        uiSwitch
        #wifi="uiSwitch"
        data-testid="wifi"
        [formField]="f.wifi"
        (checkedChangeRequest)="cancel($event)"
      >
        Wi-Fi
      </button>
      <input [uiSwitchInput]="wifi" data-testid="wifi-input" />
      <div
        uiRadioGroup
        appReadyProbe="size"
        appEarlyFocus="size"
        data-testid="size"
        aria-label="Size"
        [formField]="f.size"
        (valueChangeRequest)="cancel($event)"
      >
        <button uiRadio #small="uiRadio" value="s" data-testid="size-s">Small</button>
        <input [uiRadioInput]="small" data-testid="size-s-input" />
        <button uiRadio #large="uiRadio" value="l" data-testid="size-l">Large</button>
        <input [uiRadioInput]="large" data-testid="size-l-input" />
      </div>
      <div
        uiSelect
        data-testid="fruit"
        [formField]="f.fruit"
        [items]="fruits"
        (valueChangeRequest)="cancel($event)"
      >
        <button uiSelectTrigger aria-label="Fruit">
          Fruit: <span uiSelectValue #fruit="uiSelectValue">{{ fruit.state().label }}</span>
        </button>
        <div uiSelectContent>
          <div [uiSelectItem]="'apple'" label="Apple" data-testid="fruit-apple">Apple</div>
          <div [uiSelectItem]="'pear'" label="Pear" data-testid="fruit-pear">Pear</div>
        </div>
        <textarea uiSelectFormInput data-testid="fruit-input"></textarea>
      </div>
      <div
        uiSelect
        appReadyProbe="country"
        appEarlyFocus="country"
        appEarlyFocusSequence="terms wifi size-s outside-a outside-b"
        data-testid="country"
        [formField]="f.country"
        [items]="countryItems"
        [itemToValue]="key"
        [itemToLabel]="label"
        (valueChangeRequest)="cancel($event)"
      >
        <button uiSelectTrigger aria-label="Country">
          Country: <span uiSelectValue #country="uiSelectValue">{{ country.state().label }}</span>
        </button>
        <div uiSelectContent>
          @for (item of countries; track item.id) {
            <div
              [uiSelectItem]="item"
              [label]="item.label"
              [attr.data-testid]="'country-' + item.id"
            >
              {{ item.label }}
            </div>
          }
        </div>
        <textarea uiSelectFormInput data-testid="country-input"></textarea>
      </div>
      <button type="reset" data-testid="native-reset">Native reset</button>
    </form>
    <button data-testid="external" (click)="model.set(alternate())">model.set</button>
    <button data-testid="clear-size" (click)="clearSize()">Clear size</button>
    <button data-testid="angular-reset" (click)="f().reset(initial())">Angular reset</button>
    <button data-testid="alternate-reset" (click)="f().reset(alternate())">
      Angular reset to alternate
    </button>
    <button data-testid="cancel" (click)="veto.set(!veto())">Cancel: {{ veto() }}</button>
    <button data-testid="disabled" (click)="isDisabled.set(!isDisabled())">
      Disabled: {{ isDisabled() }}
    </button>
    <button data-testid="required" (click)="isRequired.set(!isRequired())">
      Required: {{ isRequired() }}
    </button>
    <button data-testid="readonly" (click)="isReadonly.set(!isReadonly())">
      Readonly: {{ isReadonly() }}
    </button>
    <button data-testid="portal" (click)="portal()">Move the fruit popup to body</button>
    <button data-testid="focus-terms" (click)="f.terms().focusBoundControl()">Focus terms</button>
    <button data-testid="focus-size" (click)="f.size().focusBoundControl()">Focus size</button>
    <button data-testid="focus-country" (click)="f.country().focusBoundControl()">
      Focus country
    </button>
    <output data-testid="model">{{ model() | json }}</output>
    <output data-testid="touched">{{ touched() | json }}</output>
    <output data-testid="field-flags">{{ flags() | json }}</output>
    <span data-testid="app-ready" [attr.data-ready]="ready()">ready</span>
  `,
})
export class SignalForms {
  protected readonly countries = countries;
  protected readonly countryItems = countries.map((value) => ({ value, label: value.label }));
  protected readonly fruits = ["apple", "pear"];
  protected readonly key = (country: Country) => country.id;
  protected readonly label = (country: Country) => country.label;
  protected readonly initial = initial;
  protected readonly alternate = alternate;
  protected readonly model = signal(initial());
  protected readonly veto = signal(false);
  protected readonly isDisabled = signal(false);
  protected readonly isRequired = signal(false);
  protected readonly isReadonly = signal(false);
  // Rules per typed path: one loop over paths of different value types doesn't compile.
  protected readonly f = form(
    this.model,
    (path) => {
      disabled(path.terms, () => this.isDisabled());
      required(path.terms, { when: () => this.isRequired() });
      readonly(path.terms, () => this.isReadonly());
      disabled(path.wifi, () => this.isDisabled());
      required(path.wifi, { when: () => this.isRequired() });
      readonly(path.wifi, () => this.isReadonly());
      disabled(path.size, () => this.isDisabled());
      required(path.size, { when: () => this.isRequired() });
      readonly(path.size, () => this.isReadonly());
      disabled(path.fruit, () => this.isDisabled());
      required(path.fruit, { when: () => this.isRequired() });
      readonly(path.fruit, () => this.isReadonly());
      disabled(path.country, () => this.isDisabled());
      required(path.country, { when: () => this.isRequired() });
      readonly(path.country, () => this.isReadonly());
    },
    { name: "signup" },
  );
  protected readonly ready = renderedFlag();

  constructor() {
    startWindow("size", "country");
  }

  protected touched(): boolean[] {
    const f = this.f;

    return [
      f.terms().touched(),
      f.wifi().touched(),
      f.size().touched(),
      f.fruit().touched(),
      f.country().touched(),
    ];
  }

  protected flags(): boolean[] {
    const terms = this.f.terms();

    return [terms.disabled(), terms.required(), terms.readonly()];
  }

  protected cancel(event: { details: { cancel(): void } }): void {
    if (this.veto()) {
      event.details.cancel();
    }
  }

  protected clearSize(): void {
    this.model.update((values) => ({ ...values, size: null }));
  }

  // Moves the live popup out of the root's element, as a portal would.
  protected portal(): void {
    const content = document.querySelector("[data-testid=fruit] [data-slot=select-content]");

    document.body.append(content!);
  }
}

/**
 * The fixture route: the form in a hydrate-on-interaction block under incremental hydration, and
 * two plain inputs outside it, focusable before the block hydrates.
 */
@Component({
  imports: [SignalForms],
  template: `
    @if (incremental) {
      @defer (hydrate on interaction) {
        <app-signal-forms />
      }
    } @else {
      <app-signal-forms />
    }
    <input data-testid="outside-a" aria-label="Outside A" />
    <input data-testid="outside-b" aria-label="Outside B" />
  `,
})
export class SignalFormsRoute {
  protected readonly incremental = incremental;
}
