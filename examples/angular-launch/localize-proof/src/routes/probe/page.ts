import { Component, computed, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { RpcRedirect } from "@loozo/angular-launch";
import { ownUrls } from "../../urls";
import { injectRoute } from "./route.generated";

// Catches the redirect of `probe.go` without navigating, next to this build's own URL for the
// same destination.
@Component({
  imports: [RouterLink],
  template: `
    <h1 id="page" data-id="probe">Probe</h1>
    <p>
      caught <code id="caught">{{ caught() }}</code>
    </p>
    <p>
      own <code id="own">{{ own() }}</code>
    </p>
    <a id="own-link" [routerLink]="own()">Follow the own URL</a>
  `,
})
export default class Probe {
  readonly #route = injectRoute();
  readonly #target = this.#route.search().target ?? "";
  protected readonly caught = signal("");
  // Own keys only: a target such as `__proto__` names no URL, as the server's schema refuses it.
  protected readonly own = computed(() =>
    Object.hasOwn(ownUrls, this.#target) ? ownUrls[this.#target]() : "",
  );

  constructor() {
    this.#route.remote.probe.go(this.#target, { transferCache: false }).then(
      () => this.caught.set("resolved"),
      (error: unknown) =>
        this.caught.set(
          error instanceof RpcRedirect ? error.to : `not a redirect: ${String(error)}`,
        ),
    );
  }
}
