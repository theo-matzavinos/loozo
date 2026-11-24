import { Component, computed } from "@angular/core";
import { RouterLink } from "@angular/router";
import { localeUrls } from "@loozo/angular-router";
import { destination } from "./destination.generated.js";
import { injectRoute } from "./route.generated.js";

// The pure form inside the lazy chunk: this page's URLs in each locale, from its destination.
@Component({
  imports: [RouterLink],
  template: `
    <section id="members" [attr.data-locale-urls]="urls()">
      <h2>Members of team {{ route.params().teamId }}</h2>
      <a id="members-self" [routerLink]="route.link({ params: { teamId: route.params().teamId } })"
        >This page</a
      >
    </section>
  `,
})
export default class Members {
  readonly route = injectRoute();
  readonly urls = computed(() =>
    JSON.stringify(localeUrls(destination, { params: { teamId: this.route.params().teamId } })),
  );
}
