import { Component } from "@angular/core";
import { injectRoute } from "./route.generated";

@Component({
  template: `<h1 id="page" data-id="not-found">not-found</h1>
    <p>
      params <code id="values">{{ values() }}</code>
    </p>`,
})
export default class Page {
  readonly #route = injectRoute();
  protected readonly values = () => JSON.stringify(this.#route.params());
}
