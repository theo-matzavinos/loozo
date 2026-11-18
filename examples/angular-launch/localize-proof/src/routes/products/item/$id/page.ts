import { Component } from "@angular/core";
import { injectRoute } from "./route.generated";

@Component({
  template: `<section id="detail" data-id="products/item/$id">
    detail <code class="values">{{ values() }}</code>
  </section>`,
})
export default class Page {
  readonly #route = injectRoute();
  protected readonly values = () => JSON.stringify(this.#route.params());
}
