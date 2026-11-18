import { Component, computed } from "@angular/core";
import { RouterLink } from "@angular/router";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterLink],
  template: `
    <h1>Product {{ route.params().productId }}</h1>
    <p>Tab: {{ route.search().tab }}</p>
    <a [routerLink]="reviews()">Reviews</a>
  `,
})
export default class Product {
  readonly route = injectRoute();
  // Built where it renders, so it follows commits.
  readonly reviews = computed(() =>
    this.route.link({
      params: { productId: 42 },
      search: { tab: "reviews" },
      fragment: "reviews",
    }),
  );
}
