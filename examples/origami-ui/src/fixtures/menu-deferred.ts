import { Component } from "@angular/core";
import { MenuFixture } from "./menu.js";

@Component({
  selector: "acceptance-menu-deferred",
  imports: [MenuFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-menu-fixture />
    } @placeholder {
      <p>Menu fixture</p>
    }
  `,
})
export class MenuDeferred {}
