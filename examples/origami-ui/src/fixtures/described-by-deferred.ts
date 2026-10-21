import { Component } from "@angular/core";
import { DescribedByFixture } from "./described-by.js";

@Component({
  selector: "acceptance-described-by-deferred",
  imports: [DescribedByFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-described-by-fixture />
    } @placeholder {
      <p>Co-applied description fixture</p>
    }
  `,
})
export class DescribedByDeferred {}
