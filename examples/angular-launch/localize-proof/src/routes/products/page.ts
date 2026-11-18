import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { injectRoute } from "./route.generated";

@Component({
  imports: [RouterOutlet],
  template: `<h1 id="page" data-id="products">products</h1>
    <p>
      search <code id="values">{{ values() }}</code>
    </p>
    <router-outlet name="detail" />`,
})
export default class Page {
  readonly #route = injectRoute();
  protected readonly values = () => JSON.stringify(this.#route.search());
}
