import { Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";
import { injectRoute } from "./route.generated.js";
import { destination as child } from "./child/destination.generated.js";

@Component({
  imports: [RouterLink, RouterOutlet],
  template: `
    <article id="literal">
      <p>Literal products/(detail:item)</p>
      <a id="literal-child" [routerLink]="route.link({ to: child })">Child</a>
      <router-outlet />
    </article>
  `,
})
export default class Literal {
  readonly route = injectRoute();
  readonly child = child;
}
