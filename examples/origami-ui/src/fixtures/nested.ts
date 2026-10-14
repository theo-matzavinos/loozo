import { Component, signal } from "@angular/core";
import { NestedOwner } from "./nested-owner.js";

@Component({
  selector: "acceptance-nested-hydration",
  imports: [NestedOwner],
  template: `
    <h1>Nested owner and part hydration</h1>
    <button type="button" data-testid="nested-mount" (click)="mounted.set(!mounted())">
      Mount deferred owner
    </button>
    @if (mounted()) {
      @defer (hydrate on interaction) {
        <acceptance-nested-owner />
      } @placeholder {
        <p>Owner placeholder</p>
      }
    }
  `,
})
export class NestedHydration {
  readonly mounted = signal(true);
}
