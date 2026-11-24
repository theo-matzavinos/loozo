import {
  ApplicationRef,
  Component,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import {
  RouteConfigLoadEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";
import { injectActiveRoute, type ActiveRoute } from "../generated/routes.generated.js";
import { destination as home } from "./routes/+home/destination.generated.js";
import { destination as products } from "./routes/products/destination.generated.js";
import { destination as overview } from "./routes/products/+overview/destination.generated.js";
import { destination as list } from "./routes/products/list/destination.generated.js";
import { destination as item } from "./routes/products/item/$id/destination.generated.js";
import { destination as chat } from "./routes/chat/$id/destination.generated.js";
import { destination as chatRest } from "./routes/chat/$rest[]/destination.generated.js";
import { destination as filesRest } from "./routes/files/$rest[]/destination.generated.js";
import { destination as plain } from "./routes/plain/destination.generated.js";
import { destination as teamList } from "./routes/teams/$teamId/list/destination.generated.js";
import { destination as teamItem } from "./routes/teams/$teamId/item/$id/destination.generated.js";
import { destination as profile } from "./routes/account/+layout/profile/destination.generated.js";
import { destination as literal } from "./routes/literal/destination.generated.js";
import { destination as missing } from "./routes/$segments[]/destination.generated.js";

// Primary destinations the shell can name; branch destinations are never the active route.
const named = { home, products, overview, list, plain, teamList, profile, literal, missing };

@Component({
  selector: "proof-app",
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <main>
      <h1>Router named outlets proof</h1>
      <p>
        Active route: <strong id="active-route">{{ activeName() }}</strong>
      </p>
      <nav>
        <a id="shell-open" [routerLink]="active()?.link({ to: chat, params: { id: 8 } })">Chat 8</a>
        <a id="shell-open-computed" [routerLink]="openChat()">Chat 8 (computed)</a>
        <a id="shell-close" [routerLink]="active()?.link({ to: chat, close: true })">Close chat</a>
        <a id="shell-close-computed" [routerLink]="closeChat()">Close chat (computed)</a>
        <a id="shell-list" [routerLink]="active()?.link({ to: list, search: { page: 2 } })"
          >List page 2</a
        >
        <a id="shell-list-computed" [routerLink]="listPage()">List page 2 (computed)</a>
        <a
          id="shell-products"
          [routerLink]="active()?.link({ to: products })"
          routerLinkActive="active"
          >Products</a
        >
      </nav>
      <div class="panes">
        <section id="primary"><router-outlet /></section>
        <aside id="chat-outlet"><router-outlet name="chat" /></aside>
      </div>
    </main>
  `,
})
export default class App {
  readonly application = inject(ApplicationRef);
  readonly router = inject(Router);
  // Read first in the template, after construction.
  readonly active = injectActiveRoute();
  readonly chat = chat;
  readonly products = products;
  readonly list = list;
  readonly activeName = computed(() => this.nameOf(this.active()));
  // Built where they render, so they follow commits.
  readonly openChat = computed(() => this.active()?.link({ to: chat, params: { id: 8 } }));
  readonly closeChat = computed(() => this.active()?.link({ to: chat, close: true }));
  readonly listPage = computed(() => this.active()?.link({ to: list, search: { page: 2 } }));

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const proof = window as unknown as Record<string, unknown>;

      const loads: string[] = [];

      proof["proofApp"] = this;
      proof["proofDestinations"] = { ...named, item, chat, chatRest, filesRest, teamItem };
      proof["proofLoads"] = loads;
      // Which records' children tables the browser loaded, in order.
      this.router.events.subscribe((event) => {
        if (event instanceof RouteConfigLoadEnd && event.route.loadChildren) {
          loads.push(`${event.route.outlet ?? "primary"}:${event.route.path ?? ""}`);
        }
      });
    }

    afterNextRender(() => {
      const proof = window as unknown as Record<string, unknown>;
      const hrefs: Record<string, string | null> = {};

      for (const id of [
        "shell-open",
        "shell-open-computed",
        "shell-close",
        "shell-close-computed",
        "shell-list",
        "shell-list-computed",
      ]) {
        hrefs[id] = document.getElementById(id)?.getAttribute("href") ?? null;
      }

      proof["proofFirstClient"] = {
        hrefs,
        active: this.activeName(),
        committed: this.router.lastSuccessfulNavigation() !== null,
      };

      void this.application.whenStable().then(() => {
        document.documentElement.dataset["proofStable"] = "true";
      });
    });
  }

  nameOf(route: ActiveRoute | undefined): string {
    if (!route) {
      return "none";
    }

    for (const [name, destination] of Object.entries(named)) {
      if (route.is(destination)) {
        return name;
      }
    }

    return "unknown";
  }
}
