import { Component } from "@angular/core";
import { AvatarSplitFixture } from "./avatar-split.js";

@Component({
  selector: "acceptance-avatar-split-deferred",
  imports: [AvatarSplitFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-avatar-split-fixture />
    } @placeholder {
      <p>Split avatar fixture</p>
    }
  `,
})
export class AvatarSplitDeferred {}
