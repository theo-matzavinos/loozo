import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterOutlet],
  template: `
    <article id="team">
      <h2>
        Team <span id="team-id">{{ route.params().teamId }}</span>
      </h2>
      <div class="panes">
        <section><router-outlet /></section>
        <aside><router-outlet name="detail" /></aside>
      </div>
    </article>
  `,
})
export default class Team {
  readonly route = injectRoute();
}
