import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

// The root page: the shell's links, each child page below them, and the root branches.
@Component({
  imports: [RouterOutlet],
  template: `<router-outlet /><router-outlet name="chat" /><router-outlet name="aside" />`,
})
export default class Root {}
