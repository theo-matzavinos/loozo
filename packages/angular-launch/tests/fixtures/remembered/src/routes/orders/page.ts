import { Component } from "@angular/core";
import { injectRoute } from "./route.generated";

@Component({
  selector: "orders-page",
  template: `
    <h1 id="page">orders</h1>
    <p id="values">filter={{ route.search().filter }} pageSize={{ route.search().pageSize }}</p>
    <p id="result">{{ route.data().orders.filter }}</p>
  `,
})
export default class Page {
  protected readonly route = injectRoute();
}
