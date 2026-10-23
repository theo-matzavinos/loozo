import { Component } from "@angular/core";
import { injectQuery } from "@tanstack/angular-query";
import { injectQueries } from "./rpc.generated";

// Reads only through injectQuery, so prerendering it proves queries need a live request too.
@Component({
  selector: "launch-identity",
  template: `<h1>Query identity</h1>
    <p id="query-identity">{{ session.data()?.user }}</p>`,
})
export default class Identity {
  readonly #queries = injectQueries();
  readonly session = injectQuery(() => this.#queries.session.current.queryOptions());
}
