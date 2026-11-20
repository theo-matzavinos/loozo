import { Component } from "@angular/core";
import { AvatarFixture } from "./avatar.js";

@Component({
  selector: "acceptance-avatar-deferred",
  imports: [AvatarFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-avatar-fixture />
    } @placeholder {
      <p>Avatar fixture</p>
    }
  `,
})
export class AvatarDeferred {}
