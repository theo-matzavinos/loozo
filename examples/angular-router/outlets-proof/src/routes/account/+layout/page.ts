import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  imports: [RouterOutlet],
  template: `
    <div id="account-layout" class="panes">
      <section><router-outlet /></section>
      <aside><router-outlet name="aside" /></aside>
    </div>
  `,
})
export default class AccountLayout {}
