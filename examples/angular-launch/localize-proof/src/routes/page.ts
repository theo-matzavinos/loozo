import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

// The root page: the shell's links, and each child page below them.
@Component({ imports: [RouterOutlet], template: `<router-outlet />` })
export default class Root {}
