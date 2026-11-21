import { Component, signal } from "@angular/core";
import { ScrollAreaFixture } from "./scroll-area.js";

// Incremental hydration: the fixture in a `hydrate when` block, so wheel, keys and focus inside it
// leave it dormant (Origami adds no `jsaction`), and only the attach click, outside it, hydrates it.
@Component({
  selector: "acceptance-scroll-area-deferred",
  imports: [ScrollAreaFixture],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach scroll area behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    @defer (hydrate when attached()) {
      <acceptance-scroll-area-fixture />
    } @placeholder {
      <p>Deferred scroll area</p>
    }
  `,
})
export class ScrollAreaDeferred {
  readonly attached = signal(false);
}
