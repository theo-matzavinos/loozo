import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  selector: "bench-app",
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {}
