import { Component, signal } from "@angular/core";
import type { UiSdkEvent } from "@loozo/ui-sdk-angular";
import {
  UiSelect,
  UiSelectContent,
  UiSelectItem,
  UiSelectTrigger,
  UiSelectValue,
} from "@loozo/ui-sdk-angular/select";
import { UiToggle } from "@loozo/ui-sdk-angular/toggle";
import type { SelectOptions } from "@ui-sdk/core/select";
import type { ToggleOptions } from "@ui-sdk/core/toggle";
import { AppToggle } from "./app-toggle";

type PressedRequest = UiSdkEvent<NonNullable<ToggleOptions["onPressedChange"]>>;
type ValueRequest = UiSdkEvent<NonNullable<SelectOptions<string>["onValueChange"]>>;

/** Controlled and uncontrolled Toggles (direct and composed) and Selects, with cancellation. */
@Component({
  selector: "app-controlled",
  imports: [
    UiToggle,
    AppToggle,
    UiSelect,
    UiSelectTrigger,
    UiSelectValue,
    UiSelectContent,
    UiSelectItem,
  ],
  template: `
    <section data-testid="direct">
      <button uiToggle data-testid="uncontrolled">Uncontrolled</button>
      <button uiToggle data-testid="controlled" [(pressed)]="directPressed">Controlled</button>
      <output data-testid="controlled-value">{{ directPressed() }}</output>
      <button data-testid="controlled-set" (click)="directPressed.set(!directPressed())">
        Set
      </button>
      <button
        uiToggle
        data-testid="vetoed"
        (pressedChangeRequest)="veto($event)"
        (pressedChange)="directChanges.set(directChanges() + 1)"
      >
        Vetoed
      </button>
      <output data-testid="vetoed-changes">{{ directChanges() }}</output>
      <button uiToggle data-testid="disabled" [disabled]="true">Disabled</button>
    </section>
    <section data-testid="composed">
      <button appToggle data-testid="uncontrolled">Uncontrolled</button>
      <button appToggle data-testid="controlled" [(pressed)]="composedPressed">Controlled</button>
      <output data-testid="controlled-value">{{ composedPressed() }}</output>
      <button data-testid="controlled-set" (click)="composedPressed.set(!composedPressed())">
        Set
      </button>
      <button
        appToggle
        data-testid="vetoed"
        (pressedChangeRequest)="veto($event)"
        (pressedChange)="composedChanges.set(composedChanges() + 1)"
      >
        Vetoed
      </button>
      <output data-testid="vetoed-changes">{{ composedChanges() }}</output>
      <button appToggle data-testid="disabled" [disabled]="true">Disabled</button>
    </section>

    <div
      uiSelect
      data-testid="controlled-select"
      [(value)]="fruit"
      (valueChangeRequest)="guard($event)"
    >
      <button uiSelectTrigger aria-label="Controlled fruit">
        <span uiSelectValue #shown="uiSelectValue">{{ shown.state().value ?? "none" }}</span>
      </button>
      <div uiSelectContent>
        <div [uiSelectItem]="'apple'" label="Apple" data-option="apple">Apple</div>
        <div [uiSelectItem]="'banana'" label="Banana" data-option="banana">Banana (vetoed)</div>
        <div [uiSelectItem]="'cherry'" label="Cherry" data-option="cherry">Cherry</div>
      </div>
    </div>
    <output data-testid="fruit">{{ fruit() ?? "null" }}</output>
    <output data-testid="requests">{{ requests() }}</output>
    <button data-testid="clear" (click)="fruit.set(null)">Clear</button>

    <div uiSelect data-testid="uncontrolled-select" (valueChange)="picked.set($event)">
      <button uiSelectTrigger aria-label="Uncontrolled fruit">
        <span uiSelectValue #picker="uiSelectValue">
          @if (picker.state().placeholder) {
            Pick one
          } @else {
            {{ picker.state().label }}
          }
        </span>
      </button>
      <div uiSelectContent>
        <div [uiSelectItem]="'kiwi'" label="Kiwi" data-option="kiwi">Kiwi</div>
        <div [uiSelectItem]="'lime'" label="Lime" data-option="lime">Lime</div>
      </div>
    </div>
    <output data-testid="picked">{{ picked() ?? "null" }}</output>
  `,
})
export class Controlled {
  protected readonly directPressed = signal(false);
  protected readonly composedPressed = signal(false);
  protected readonly directChanges = signal(0);
  protected readonly composedChanges = signal(0);
  protected readonly fruit = signal<string | null>("apple");
  protected readonly requests = signal(0);
  protected readonly picked = signal<string | null>(null);

  protected veto({ details }: PressedRequest): void {
    details.cancel();
  }

  protected guard({ value, details }: ValueRequest): void {
    this.requests.set(this.requests() + 1);

    if (value === "banana") {
      details.cancel();
    }
  }
}
