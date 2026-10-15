import { Component, afterNextRender } from "@angular/core";
import { RouterLink } from "@angular/router";
import { injectRoute } from "./route.generated.js";

@Component({
  selector: "proof-item",
  imports: [RouterLink],
  template: `
    <article id="item-article">
      <h2>Item</h2>
      <h3>Parsed inputs</h3>
      <p id="parsed">
        Team <span id="parsed-team">{{ route.params().teamId }}</span> Item
        <span id="parsed-id">{{ route.params().id }}</span> Score
        <span id="parsed-score">{{ route.search().score }}</span>
      </p>
      <h3>Local resolved data</h3>
      <p id="resolved">{{ route.data().item.text }}</p>
      <nav>
        <a id="direct" [routerLink]="direct">Direct item 8</a>
        <a id="alias" [routerLink]="alias">Alias item 8, drop query and fragment</a>
        <a id="query" [routerLink]="query">Score 44</a>
      </nav>
    </article>
  `,
})
export default class Item {
  readonly route = injectRoute();
  readonly direct = this.route.link({ params: { teamId: 7, id: 8 }, search: { score: 43 } });
  readonly alias = this.route.link("/teams/$teamId/old-items/$id", {
    params: { teamId: 7, id: 8 },
    search: { score: 99 },
    fragment: "old",
  });
  readonly query = this.route.link({ params: { teamId: 7, id: 8 }, search: { score: 44 } });

  constructor() {
    afterNextRender(() => {
      const proof = window as unknown as { proofItemInstance: Item };

      proof.proofItemInstance = this;
    });
  }
}
