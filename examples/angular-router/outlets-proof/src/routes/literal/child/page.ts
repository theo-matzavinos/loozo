import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterLink],
  template: `<p id="literal-child-page">Literal child <a id="literal-up" [routerLink]="route.link({ to: '..' })">Up</a></p>`,
})
export default class LiteralChild {
  readonly route = injectRoute();
}
