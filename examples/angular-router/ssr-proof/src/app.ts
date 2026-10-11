import { ApplicationRef, Component, afterNextRender, inject } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  selector: "proof-app",
  imports: [RouterOutlet],
  template: `
    <main>
      <h1>Router SSR proof</h1>
      <router-outlet />
    </main>
  `,
})
export default class App {
  readonly application = inject(ApplicationRef);

  constructor() {
    afterNextRender(() => {
      void this.application.whenStable().then(() => {
        document.documentElement.dataset.proofStable = "true";
      });
    });
  }
}
