import { Component, computed } from "@angular/core";
import { RouterLink } from "@angular/router";
import { createUrl } from "@loozo/angular-router";
import { destination } from "./destination.generated.js";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterLink],
  template: `
    <section id="product">
      <h2>Product <span id="product-id">{{ route.params().productId }}</span></h2>
      <p>
        <a id="next-product" [routerLink]="route.link({ params: { productId: next() } })">Next product</a>
      </p>
      <p>createUrl: <code id="create-url">{{ url() }}</code></p>
    </section>
  `,
})
export default class Product {
  readonly route = injectRoute();
  readonly next = computed(() => this.route.params().productId + 1);
  readonly url = computed(() =>
    createUrl(destination, { params: { productId: this.route.params().productId } }),
  );
}
