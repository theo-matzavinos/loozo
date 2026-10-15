import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { createUrl } from "@loozo/angular-router";
import home from "../+home/route.js";

@Component({
  imports: [RouterLink],
  template: `
    <main id="main" tabindex="-1" class="page">
      <h1>Page not found</h1>
      <p>There's no documentation page at this address.</p>
      <p><a [routerLink]="homeUrl">Browse all packages</a></p>
    </main>
  `,
})
export default class NotFoundPage {
  readonly homeUrl = createUrl(home, {});
}
