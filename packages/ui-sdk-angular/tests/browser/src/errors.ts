import { Component, signal } from "@angular/core";
import { UiToggle } from "@loozo/ui-sdk-angular/toggle";

/** D18: a root's state read from a binding on its own element, created on demand. */
@Component({
  selector: "app-errors",
  imports: [UiToggle],
  template: `
    <button data-testid="show" (click)="shown.set(true)">Show</button>
    @if (shown()) {
      <button
        uiToggle
        #toggle="uiToggle"
        data-testid="same-element"
        [class.on]="toggle.state().pressed"
      >
        Broken
      </button>
    }
  `,
})
export class Errors {
  protected readonly shown = signal(false);
}
