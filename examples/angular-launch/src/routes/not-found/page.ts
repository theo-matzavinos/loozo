import { Component } from "@angular/core";

// Rendered at the requested URL when a resolver's call answers notFound().
@Component({
  selector: "launch-not-found",
  template: `<h1 id="not-found-title">Not found</h1>`,
})
export default class NotFound {}
