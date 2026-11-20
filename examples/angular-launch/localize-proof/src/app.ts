import { isPlatformBrowser } from "@angular/common";
import { Component, inject, LOCALE_ID, PLATFORM_ID } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router, RouterLink, RouterOutlet } from "@angular/router";
import { filter, map } from "rxjs";
import { createUrl } from "@loozo/angular-router";
import { injectAlternates } from "./alternates";
import { LanguageSwitcher } from "./language-switcher";
import { destination as guarded } from "./routes/+authenticated/guarded/destination.generated";
import { destination as lazyGuarded } from "./routes/+authenticated/lazy/guarded/destination.generated";
import { destination as live } from "./routes/+authenticated/live/destination.generated";
import { destination as manualsStart } from "./routes/manuals/start/destination.generated";

declare global {
  // In the browser: a router navigation, as a link click starts one, for the proof to drive.
  var proofNavigate: ((url: string) => Promise<boolean>) | undefined;
}

@Component({
  selector: "proof-root",
  imports: [RouterLink, RouterOutlet, LanguageSwitcher],
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
    <app-language-switcher />
    <router-outlet />
  `,
})
export class App {
  readonly #router = inject(Router);
  protected readonly locale = inject(LOCALE_ID);
  // The router-relative URL after redirects; the base href adds the locale.
  protected readonly at = toSignal(
    this.#router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: "" },
  );
  protected readonly guarded = createUrl(guarded, {});
  protected readonly lazyGuarded = createUrl(lazyGuarded, {});
  protected readonly live = createUrl(live, {});
  protected readonly manualsStart = createUrl(manualsStart, {});

  constructor() {
    injectAlternates();

    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      globalThis.proofNavigate = (url) => this.#router.navigateByUrl(url);
    }
  }
}
