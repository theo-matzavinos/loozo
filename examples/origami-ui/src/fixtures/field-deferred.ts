import { Component } from "@angular/core";
import { FieldFixture } from "./field.js";

@Component({
  selector: "acceptance-field-deferred",
  imports: [FieldFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-field-fixture />
    } @placeholder {
      <p>Field fixture</p>
    }
  `,
})
export class FieldDeferred {}
