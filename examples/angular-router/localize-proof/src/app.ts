import { Component, LOCALE_ID, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router, RouterLink, RouterOutlet } from "@angular/router";
import { filter, map } from "rxjs";
import { createUrl } from "@loozo/angular-router";
import { injectAlternates } from "./alternates.js";
import { LanguageSwitcher } from "./language-switcher.js";
import { destination as products } from "./routes/products/+list/destination.generated.js";
import { destination as team } from "./routes/teams/$teamId/destination.generated.js";

// Links only to the team, never to its members: the members destination stays in the lazy
// children table. The language switcher links to this page in each locale's build, and the
// head holds its hreflang alternates.
@Component({
  selector: "proof-app",
  imports: [LanguageSwitcher, RouterLink, RouterOutlet],
  template: `
    <main>
      <h1>Translated route segments</h1>
      <nav>
        <a id="products-link" [routerLink]="productsUrl">Products</a>
        <a id="teams-link" [routerLink]="teamUrl">Team 7</a>
      </nav>
      <proof-language-switcher />
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

  constructor() {
    injectAlternates();
  }
}
