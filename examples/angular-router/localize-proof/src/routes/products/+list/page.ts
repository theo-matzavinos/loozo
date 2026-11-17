import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { destination as product } from "../$productId/destination.generated.js";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterLink],
  template: `
    <section id="products">
      <h2>Products</h2>
      <a id="product-1" [routerLink]="route.link({ to: product, params: { productId: 1 } })">Product 1</a>
      ·
      <a id="product-2" [routerLink]="route.link({ to: product, params: { productId: 2 } })">Product 2</a>
    </section>
  `,
})
export default class Products {
  readonly route = injectRoute();
  readonly product = product;
}
