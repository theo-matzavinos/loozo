import { Component } from "@angular/core";
import { injectRoute } from "./route.generated";

@Component({
  selector: "cached-page",
  template: `
    <h1 id="page">cached</h1>
    <p id="values">filter={{ route.search().filter }}</p>
  `,
})
export default class Page {
  protected readonly route = injectRoute();
}
