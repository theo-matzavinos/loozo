import { Component, computed } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";
import { injectRoute } from "./route.generated.js";
import { destination as order } from "./$id/destination.generated.js";
import { destination as login } from "../../login/destination.generated.js";

@Component({
  imports: [RouterLink, RouterOutlet],
  template: `
    <article id="orders">
      <h2>{{ route.data().label }}</h2>
      <nav>
        <a id="orders-order" [routerLink]="order()">Order 7</a>
        <a id="orders-drop" [routerLink]="drop()">Orders without a workspace</a>
        <a id="orders-login" [routerLink]="login()">Log in</a>
      </nav>
      <router-outlet />
    </article>
  `,
})
export default class Orders {
  readonly route = injectRoute();
  readonly order = computed(() => this.route.link({ to: order, params: { id: 7 } }));
  // An explicit undefined drops a retained key.
  readonly drop = computed(() => this.route.link({ search: { workspace: undefined } }));
  // A page outside the key's owner never receives it.
  readonly login = computed(() => this.route.link({ to: login }));
}
