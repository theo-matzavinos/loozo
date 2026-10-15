import { Component } from "@angular/core";
import { injectRoute } from "./route.generated.js";

@Component({
  template: `<h1>{{ route.data().item.name }}</h1>`,
})
export default class Item {
  readonly route = injectRoute();
}
