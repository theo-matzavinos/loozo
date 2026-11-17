import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterLink],
  template: `
    <section id="members">
      <h2>Members of team {{ route.params().teamId }}</h2>
      <a id="members-self" [routerLink]="route.link({ params: { teamId: route.params().teamId } })">This page</a>
    </section>
  `,
})
export default class Members {
  readonly route = injectRoute();
}
