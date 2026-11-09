import { Component } from "@angular/core";
import { NumberFieldFixture } from "./number-field.js";

@Component({
  selector: "acceptance-number-field-deferred",
  imports: [NumberFieldFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-number-field-fixture />
    } @placeholder {
      <p>Number field fixture</p>
    }
  `,
})
export class NumberFieldDeferred {}
