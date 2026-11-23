import { Component, computed } from "@angular/core";
import { RouterLink } from "@angular/router";
import { injectRoute } from "./route.generated.js";
import { destination as orders } from "../+workspace/orders/destination.generated.js";

@Component({
  imports: [RouterLink],
  template: `
    <section id="login">
      <a id="login-orders" [routerLink]="orders()">Orders</a>
    </section>
  `,
})
export default class Login {
  readonly route = injectRoute();
  // Outside the owner, there is no workspace to keep.
  readonly orders = computed(() => this.route.link({ to: orders }));
}
