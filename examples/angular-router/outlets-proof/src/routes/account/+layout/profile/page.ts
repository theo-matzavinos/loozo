import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { injectRoute } from "./route.generated.js";
import { destination as help } from "../help/destination.generated.js";

@Component({
  imports: [RouterLink],
  template: `
    <p id="profile">
      Profile
      <a id="help-open" [routerLink]="route.link({ to: help })">Help</a>
      <a id="help-close" [routerLink]="route.link({ to: help, close: true })">Close help</a>
    </p>
  `,
})
export default class Profile {
  readonly route = injectRoute();
  readonly help = help;
}
