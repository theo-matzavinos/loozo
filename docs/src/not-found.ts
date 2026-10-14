import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { createUrl } from "@loozo/angular-router";
import home from "./routes/home/definition.js";
import { pageTitle } from "./page-title.js";

@Component({
  selector: "docs-not-found",
  imports: [RouterLink],
  template: `
    <h1>Page not found</h1>
    <p>There's no documentation page at this address.</p>
    <p><a [routerLink]="homeUrl">Browse all packages</a></p>
  `,
})
export class NotFound {
  readonly homeUrl = createUrl(home, {});

  constructor() {
    pageTitle(() => "Page not found");
  }
}
