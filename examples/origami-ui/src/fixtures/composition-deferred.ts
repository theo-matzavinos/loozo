import { Component } from "@angular/core";
import { CompositionFixture } from "./composition.js";

@Component({
  selector: "acceptance-composition-deferred",
  imports: [CompositionFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-composition-fixture />
    } @placeholder {
      <p>Composition fixture</p>
    }
  `,
})
export class CompositionDeferred {}
