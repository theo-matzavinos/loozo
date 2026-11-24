import { Component } from "@angular/core";
import { injectRoute } from "./route.generated.js";

@Component({
  template: `<p>
    {{ route.search().pageSize }} messages, {{ route.search().sort ?? "newest" }} first
  </p>`,
})
export default class Inbox {
  readonly route = injectRoute();
}
