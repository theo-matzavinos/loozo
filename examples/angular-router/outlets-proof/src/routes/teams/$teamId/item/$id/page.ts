import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterLink],
  template: `
    <p id="team-item">
      Team item <span id="team-item-id">{{ route.params().id }}</span>
      <a id="team-item-close" [routerLink]="route.link({ close: true })">Close</a>
    </p>
  `,
})
export default class TeamItem {
  readonly route = injectRoute();
}
