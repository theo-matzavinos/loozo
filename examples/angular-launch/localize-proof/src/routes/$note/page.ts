import { Component } from "@angular/core";
import { injectRoute } from "./route.generated";

@Component({
  template: `<section id="aside" data-id="$note">
    aside <code class="values">{{ values() }}</code>
  </section>`,
})
export default class Page {
  readonly #route = injectRoute();
  protected readonly values = () => JSON.stringify(this.#route.params());
}
