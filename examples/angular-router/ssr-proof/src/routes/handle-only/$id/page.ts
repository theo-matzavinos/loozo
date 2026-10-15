import { Component } from "@angular/core";
import { injectRoute } from "./route.generated.js";

@Component({
  template: `
    <article id="handle-only">
      <h2>Handle-only parsing</h2>
      <p>
        ID: <span id="handle-id">{{ route.params().id }}</span>
      </p>
      <p>
        Score: <span id="handle-score">{{ route.search().score }}</span>
      </p>
      <p>
        Page: <span id="handle-page">{{ route.search().page }}</span>
      </p>
    </article>
  `,
})
export default class HandleOnly {
  readonly route = injectRoute();
}
