import { Component } from "@angular/core";
import { UiToggle } from "@loozo/ui-sdk-angular/toggle";
import { AppToggle } from "./app-toggle";
import { startWindow } from "./probe";
import { renderedFlag } from "./ready";
import { SelectExample } from "./select-example";

/** The hydration case, incrementally hydrated: the Selects hydrate on interaction, from their own chunk. */
@Component({
  selector: "app-home",
  imports: [UiToggle, AppToggle, SelectExample],
  template: `
    <h1>Hydration</h1>
    <button uiToggle data-testid="toggle">Bold</button>
    <button appToggle data-testid="composed">Composed</button>
    @defer (hydrate on interaction) {
      <app-select-example />
    }
    <span data-testid="app-ready" [attr.data-ready]="ready()">{{ mode }}</span>
  `,
})
export class Home {
  protected readonly mode = "incremental";
  protected readonly ready = renderedFlag();

  constructor() {
    startWindow("toggle", "composed");
  }
}
