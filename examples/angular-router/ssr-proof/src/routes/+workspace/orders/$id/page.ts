import { Component, computed } from "@angular/core";
import { RouterLink } from "@angular/router";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterLink],
  template: `
    <section id="order">
      <p>
        Order <span id="order-id">{{ route.params().id }}</span>
      </p>
      <a id="order-back" [routerLink]="back()">Back to orders</a>
    </section>
  `,
})
export default class Order {
  readonly route = injectRoute();
  // The parent route keeps the retained key too.
  readonly back = computed(() => this.route.link({ to: ".." }));
}
