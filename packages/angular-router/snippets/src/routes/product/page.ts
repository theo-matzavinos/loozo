import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterLink],
  template: `
    @if (route.params.hasValue() && route.search.hasValue()) {
      <h1>Product {{ route.params.value().productId }}</h1>
      <p>Tab: {{ route.search.value().tab }}</p>
    } @else {
      <p>Loading…</p>
    }
    <a [routerLink]="reviews">Reviews</a>
  `,
})
export default class Product {
  readonly route = injectRoute();
  readonly reviews = this.route.link({
    params: { productId: 42 },
    search: { tab: "reviews" },
    fragment: "reviews",
  });
}
