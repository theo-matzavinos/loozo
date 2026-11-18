import { Component } from "@angular/core";
import { injectRoute } from "./route.generated.js";

@Component({
  template: `
    <p id="settings">
      Settings <button id="settings-close" type="button" (click)="close()">Close chat</button>
    </p>
  `,
})
export default class Settings {
  readonly route = injectRoute();

  close(): void {
    void this.route.navigate({ close: true });
  }
}
