import { Component } from "@angular/core";
import { SliderFixture } from "./slider.js";

@Component({
  selector: "acceptance-slider-deferred",
  imports: [SliderFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-slider-fixture />
    } @placeholder {
      <p>Deferred slider</p>
    }
  `,
})
export class SliderDeferred {}
