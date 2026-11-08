import { Component } from "@angular/core";
import { injectQuery } from "@tanstack/angular-query";
import { injectRoute } from "./route.generated";
import { injectQueries } from "./rpc.generated";

// Reads through a resolver and through injectQuery, so prerendering it covers both
// ways results reach the browser.
@Component({
  selector: "launch-about",
  template: `
    @let summary = route.data().summary;
    <h1 id="about-title">{{ summary.name }}</h1>
    @if (limits.data(); as limits) {
      <p id="about-limits">
        Titles have {{ limits.titleLength.min }}–{{ limits.titleLength.max }} characters.
      </p>
    }
    <p id="about-answered" [attr.data-request]="summary.requestId">{{ summary.answeredAt }}</p>
  `,
})
export default class About {
  readonly route = injectRoute();
  readonly #queries = injectQueries();
  readonly limits = injectQuery(() => this.#queries.about.limits.queryOptions());
}
