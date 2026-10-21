import { Component } from "@angular/core";
import { CheckboxFixture } from "./checkbox.js";

@Component({
  selector: "acceptance-checkbox-deferred",
  imports: [CheckboxFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-checkbox-fixture />
    } @placeholder {
      <p>Checkbox fixture</p>
    }
  `,
})
export class CheckboxDeferred {}
