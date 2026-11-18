import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  imports: [RouterOutlet],
  template: `<h1 id="docs">Docs</h1>
    <router-outlet />`,
})
export default class Docs {}
