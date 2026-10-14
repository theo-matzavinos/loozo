import { Component, REQUEST, afterNextRender, inject, isDevMode, signal } from "@angular/core";
import { RouterOutlet } from "@angular/router";

/** Ordinary SSR routing shell. The marker is not a hydration-completion claim. */
@Component({
  selector: "setup-readiness",
  imports: [RouterOutlet],
  host: {
    "[attr.data-runtime]": "runtime",
    "[attr.data-shell-attached]": "attached()",
    "[attr.data-request-url]": "requestUrl",
  },
  template: `<router-outlet />`,
  styles: `
    :host {
      display: block;
      color-scheme: dark;
      background: #141414;
      color: #eeeeee;
      min-block-size: 100vh;
      padding: 16px;
      font-family: system-ui, sans-serif;
    }
  `,
})
export class FixtureApp {
  readonly runtime: "development" | "production" = "production";
  readonly attached = signal(false);
  /** Read-only diagnostic of the ordinary SSR provider; the client facade defaults to null. */
  readonly requestUrl = inject(REQUEST)?.url ?? null;

  constructor() {
    if (isDevMode()) {
      this.runtime = "development";
    }

    afterNextRender(() => this.attached.set(true));
  }
}
