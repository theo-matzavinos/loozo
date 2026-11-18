import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterOutlet],
  template: `
    <article id="products">
      <h2>Products</h2>
      <p>
        sort <span id="products-sort">{{ route.search().sort ?? "none" }}</span>
      </p>
      <div class="panes">
        <section id="products-primary"><router-outlet /></section>
        <aside id="products-detail"><router-outlet name="detail" /></aside>
      </div>
    </article>
  `,
})
export default class Products {
  readonly route = injectRoute();
}
