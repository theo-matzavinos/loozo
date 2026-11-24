import { Component, computed } from "@angular/core";
import { RouterLink } from "@angular/router";
import { injectRoute } from "./route.generated.js";
import { destination as item } from "../item/$id/destination.generated.js";
import { destination as plain } from "../../plain/destination.generated.js";

@Component({
  imports: [RouterLink],
  template: `
    <article id="list">
      <p>
        List page <span id="list-page">{{ route.search().page ?? 1 }}</span>
      </p>
      <nav>
        <a id="list-item" [routerLink]="route.link({ to: item, params: { id: 3 } })">Item 3</a>
        <a id="list-page-template" [routerLink]="route.link({ search: { page: 2 } })">Page 2</a>
        <a id="list-page-computed" [routerLink]="page2()">Page 2 (computed)</a>
        <a id="list-plain" [routerLink]="route.link({ to: plain })">Plain</a>
      </nav>
    </article>
  `,
})
export default class List {
  readonly route = injectRoute();
  readonly item = item;
  readonly plain = plain;
  // Built where it renders, so it follows commits.
  readonly page2 = computed(() => this.route.link({ search: { page: 2 } }));
}
