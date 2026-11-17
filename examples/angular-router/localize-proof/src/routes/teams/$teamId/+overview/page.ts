import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { destination as members } from "../members/destination.generated.js";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterLink],
  template: `
    <section id="team">
      <h2>Team {{ route.params().teamId }}</h2>
      <a id="members-link" [routerLink]="route.link({ to: members, params: { teamId: route.params().teamId } })">Members</a>
    </section>
  `,
})
export default class Overview {
  readonly route = injectRoute();
  readonly members = members;
}
