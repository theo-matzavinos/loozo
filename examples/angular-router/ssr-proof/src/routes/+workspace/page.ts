import { Component, computed } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";
import { injectRoute } from "./route.generated.js";
import { destination as order } from "./orders/$id/destination.generated.js";

@Component({
  imports: [RouterLink, RouterOutlet],
  template: `
    <section id="workspace-layout">
      <p>
        Workspace: <span id="workspace-value">{{ route.search().workspace ?? "none" }}</span>
      </p>
      <nav>
        <a id="layout-order" [routerLink]="order()">Order 7, from the layout</a>
      </nav>
      <router-outlet />
    </section>
  `,
})
export default class WorkspaceLayout {
  readonly route = injectRoute();
  // The layout's own handle links into a descendant: the retained key follows the current URL.
  readonly order = computed(() => this.route.link({ to: order, params: { id: 7 } }));
}
