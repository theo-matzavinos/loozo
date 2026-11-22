import { Component, computed } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";
import { injectRoute } from "./route.generated.js";
import { destination as child } from "./child/destination.generated.js";

@Component({
  imports: [RouterLink, RouterOutlet],
  template: `
    <article id="other">
      <h2>{{ route.data().label }}</h2>
      <a id="other-child" [routerLink]="child()">Child</a>
      <router-outlet />
    </article>
  `,
})
export default class Other {
  readonly route = injectRoute();
  readonly child = computed(() => this.route.link({ to: child }));
}
