import { Component, input, signal } from "@angular/core";
import { OrigamiButton } from "@loozo/origami-ui/button";

// While saving, the button stays in the Tab order and is announced as disabled. Its click still
// runs, so the handler checks the state itself.
@Component({
  selector: "app-save-button",
  imports: [OrigamiButton],
  template: `
    <button ogButton [disabled]="saving()" focusableWhenDisabled (click)="save()">Save</button>
    <output>Saved {{ saves() }} times</output>
  `,
})
export class SaveButton {
  readonly saving = input(false);
  readonly saves = signal(0);

  save(): void {
    if (this.saving()) {
      return;
    }

    this.saves.update((saves) => saves + 1);
  }
}
