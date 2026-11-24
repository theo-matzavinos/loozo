import { Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";
import { injectRoute } from "./route.generated.js";
import { destination as settings } from "./settings/destination.generated.js";

@Component({
  imports: [RouterLink, RouterOutlet],
  template: `
    <article id="chat">
      <p>
        Chat <span id="chat-id">{{ route.params().id }}</span>
      </p>
      <nav>
        <a id="chat-next" [routerLink]="route.link({ params: { id: route.params().id + 1 } })"
          >Next</a
        >
        <a
          id="chat-settings"
          [routerLink]="route.link({ to: settings, params: { id: route.params().id } })"
          >Settings</a
        >
        <a id="chat-close" [routerLink]="route.link({ close: true })">×</a>
      </nav>
      <router-outlet />
    </article>
  `,
})
export default class Chat {
  readonly route = injectRoute();
  readonly settings = settings;
}
