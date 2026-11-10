import { Component } from "@angular/core";
import { ComboboxFixture } from "./combobox.js";

@Component({
  selector: "acceptance-combobox-deferred",
  imports: [ComboboxFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-combobox-fixture />
    } @placeholder {
      <p>Combobox fixture</p>
    }
  `,
})
export class ComboboxDeferred {}
