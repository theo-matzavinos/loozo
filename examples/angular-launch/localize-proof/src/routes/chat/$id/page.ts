import { Component } from "@angular/core";
import { injectRoute } from "./route.generated";

@Component({
  template: `<section id="chat" data-id="chat/$id">
    chat <code class="values">{{ values() }}</code>
  </section>`,
})
export default class Page {
  readonly #route = injectRoute();
  protected readonly values = () => JSON.stringify(this.#route.params());
}
