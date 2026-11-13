import { Component } from "@angular/core";
import { UiToggle } from "@loozo/ui-sdk-angular/toggle";
import { AppToggle } from "./app-toggle";
import { startWindow } from "./probe";
import { renderedFlag } from "./ready";
import { SelectExample } from "./select-example";

/** The hydration case, eagerly hydrated: two Toggles and two Selects. home.incremental.ts defers the Selects. */
@Component({
  selector: "app-home",
  imports: [UiToggle, AppToggle, SelectExample],
  template: `
    <h1>Hydration</h1>
    <button uiToggle data-testid="toggle">Bold</button>
    <button appToggle data-testid="composed">Composed</button>
    <app-select-example />
    <span data-testid="app-ready" [attr.data-ready]="ready()">{{ mode }}</span>
  `,
})
export class Home {
  protected readonly mode = "eager";
  protected readonly ready = renderedFlag();

  constructor() {
    startWindow("toggle", "composed");
  }
}
