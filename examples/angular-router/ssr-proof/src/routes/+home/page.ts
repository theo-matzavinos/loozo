import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { injectRoute } from "./route.generated.js";
import { destination as item } from "../teams/$teamId/items/$id/route.generated.js";

@Component({
  imports: [RouterLink],
  template: `
    <p>Inspect parsed route inputs and local resolved item data.</p>
    <a [routerLink]="link">Team 7, item 7, score 42</a>
  `,
})
export default class Home {
  readonly route = injectRoute();
  readonly link = this.route.link(item, {
    params: { teamId: 7, id: 7 },
    search: { score: 42 },
  });
}
