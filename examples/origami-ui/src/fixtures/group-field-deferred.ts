import { Component } from "@angular/core";
import { GroupFieldFixture } from "./group-field.js";

@Component({
  selector: "acceptance-group-field-deferred",
  imports: [GroupFieldFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-group-field-fixture />
    } @placeholder {
      <p>Group field fixture</p>
    }
  `,
})
export class GroupFieldDeferred {}
