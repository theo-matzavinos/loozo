import { Component } from "@angular/core";
import { injectRoute } from "./route.generated.js";

@Component({
  template: `
    @if (route.params.hasValue()) {
      <h1>Report {{ route.params.value().reportId }}</h1>
    }
  `,
})
export default class Report {
  readonly route = injectRoute();
}
