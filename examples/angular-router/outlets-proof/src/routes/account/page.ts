import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  imports: [RouterOutlet],
  template: `<article id="account">
    <h2>Account</h2>
    <router-outlet />
  </article>`,
})
export default class Account {}
