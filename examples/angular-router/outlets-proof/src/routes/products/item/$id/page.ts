import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterLink],
  template: `
    <article id="item">
      <p>
        Item <span id="item-id">{{ route.params().id }}</span>
      </p>
      <nav>
        <a id="item-next" [routerLink]="route.link({ params: { id: route.params().id + 1 } })"
          >Next</a
        >
        <a id="item-close" [routerLink]="route.link({ close: true })">Close</a>
      </nav>
    </article>
  `,
})
export default class Item {
  readonly route = injectRoute();
}
