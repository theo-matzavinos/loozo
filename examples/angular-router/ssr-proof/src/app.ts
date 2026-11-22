import { ApplicationRef, Component, afterNextRender, computed, inject } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";
import { injectActiveRoute } from "../generated/routes.generated.js";
import { destination as order } from "./routes/+workspace/orders/$id/destination.generated.js";

@Component({
  selector: "proof-app",
  imports: [RouterLink, RouterOutlet],
  template: `
    <main>
      <h1>Router SSR proof</h1>
      @if (shellOrder(); as link) {
        <nav>
          <a id="shell-order" [routerLink]="link">Order 7, from the shell</a>
        </nav>
      }
      <router-outlet />
    </main>
  `,
})
export default class App {
  readonly application = inject(ApplicationRef);
  readonly active = injectActiveRoute();
  // The shell's active handle retains like a page's: on a hydrated page, from the server's
  // active route until the first client navigation commits.
  readonly shellOrder = computed(() => this.active()?.link({ to: order, params: { id: 7 } }));

  constructor() {
    afterNextRender(() => {
      void this.application.whenStable().then(() => {
        document.documentElement.dataset.proofStable = "true";
      });
    });
  }
}
