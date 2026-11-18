import { Component, inject, LOCALE_ID } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router, RouterLink, RouterOutlet } from "@angular/router";
import { filter, map } from "rxjs";
import { createUrl } from "@loozo/angular-router";
import { destination as guarded } from "./routes/+authenticated/guarded/destination.generated";
import { destination as lazyGuarded } from "./routes/+authenticated/lazy/guarded/destination.generated";
import { destination as live } from "./routes/+authenticated/live/destination.generated";
import { destination as manualsStart } from "./routes/manuals/start/destination.generated";

@Component({
  selector: "proof-root",
  imports: [RouterLink, RouterOutlet],
  template: `
    <p>
      Launch translated redirects · <span id="locale">{{ locale }}</span> · at
      <code id="at">{{ at() }}</code>
    </p>
    <nav>
      <a id="guarded" [routerLink]="guarded">Guarded</a> ·
      <a id="lazy-guarded" [routerLink]="lazyGuarded">Lazy guarded</a> ·
      <a id="live" [routerLink]="live">Live</a> ·
      <a id="manuals-start" [routerLink]="manualsStart">Manuals</a>
    </nav>
    <router-outlet />
  `,
})
export class App {
  protected readonly locale = inject(LOCALE_ID);
  // The router-relative URL after redirects; the base href adds the locale.
  protected readonly at = toSignal(
    inject(Router).events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: "" },
  );
  protected readonly guarded = createUrl(guarded, {});
  protected readonly lazyGuarded = createUrl(lazyGuarded, {});
  protected readonly live = createUrl(live, {});
  protected readonly manualsStart = createUrl(manualsStart, {});
}
