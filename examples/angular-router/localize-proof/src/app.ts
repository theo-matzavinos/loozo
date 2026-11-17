import { Component, LOCALE_ID, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router, RouterLink, RouterOutlet } from "@angular/router";
import { filter, map } from "rxjs";
import { createUrl } from "@loozo/angular-router";
import { destination as products } from "./routes/products/+list/destination.generated.js";
import { destination as team } from "./routes/teams/$teamId/destination.generated.js";

// Links only to the team, never to its members: the members destination stays in the lazy
// children table. The language links are document navigations into the other build.
@Component({
  selector: "proof-app",
  imports: [RouterLink, RouterOutlet],
  template: `
    <main>
      <h1>Translated route segments</h1>
      <nav>
        <a id="products-link" [routerLink]="productsUrl">Products</a>
        <a id="teams-link" [routerLink]="teamUrl">Team 7</a>
        <a id="english" href="/en/">English</a>
        <a id="german" href="/de/">Deutsch</a>
      </nav>
      <p>
        Locale <code id="locale">{{ locale }}</code> · router URL
        <code id="router-url">{{ url() }}</code>
      </p>
      <router-outlet />
    </main>
  `,
})
export default class App {
  readonly locale = inject(LOCALE_ID);
  readonly url = toSignal(
    inject(Router).events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: "" },
  );
  readonly productsUrl = createUrl(products, {});
  readonly teamUrl = createUrl(team, { params: { teamId: 7 } });
}
