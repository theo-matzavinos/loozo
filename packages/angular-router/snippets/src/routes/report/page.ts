import { Component } from "@angular/core";
import { injectRoute } from "./route.generated.js";

@Component({
  template: `<h1>Report {{ route.params().reportId }}</h1>`,
})
export default class Report {
  readonly route = injectRoute();
}
