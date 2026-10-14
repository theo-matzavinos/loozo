import { Component } from "@angular/core";
import { injectRoute } from "./route.generated.js";

@Component({
  template: `
    @if (route.data.hasValue()) {
      <h1>{{ route.data.value().item.name }}</h1>
    }
  `,
})
export default class Item {
  readonly route = injectRoute();
}
