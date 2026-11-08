import { Component } from "@angular/core";
import { injectQuery } from "@tanstack/angular-query";
import { injectQueries } from "./rpc.generated";

// Reads only through injectQuery and needs a user, so prerendering it proves that a refused
// query fails the build instead of rendering its error state into the page.
@Component({
  selector: "launch-identity",
  template: `<h1>Query identity</h1>
    <p id="query-identity">{{ session.data()?.user }}</p>`,
})
export default class Identity {
  readonly #queries = injectQueries();
  readonly session = injectQuery(() => this.#queries.session.current.queryOptions());
}
