import { Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";
import { createUrl } from "@loozo/angular-router";
import home from "./routes/home/definition.js";
import { ThemeToggle } from "./theme-toggle.js";

@Component({
  selector: "docs-shell",
  imports: [RouterLink, RouterOutlet, ThemeToggle],
  template: `
    <a class="skip-link" href="#main" (click)="skipToContent($event)">Skip to content</a>
    <header class="site-header">
      <a class="site-name" [routerLink]="homeUrl">loozo docs</a>
      <docs-theme-toggle />
    </header>
    <router-outlet />
  `,
})
export default class Shell {
  readonly homeUrl = createUrl(home, {});

  /** A plain "#main" link would resolve against <base href> and leave the page. */
  skipToContent(event: MouseEvent) {
    const main = document.getElementById("main");

    if (main === null) {
      return;
    }

    event.preventDefault();
    main.focus();
  }
}
