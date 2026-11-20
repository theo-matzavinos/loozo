import { Component, LOCALE_ID, signal } from "@angular/core";
import { ProgressStepBar } from "./progress.js";

// PR7: a step bar in its own `@defer (hydrate on interaction)` block, bound to a signal of the
// hydrated route component, whose controls stay outside the block so they don't hydrate it.
@Component({
  selector: "acceptance-progress-block-fixture",
  imports: [ProgressStepBar],
  providers: [{ provide: LOCALE_ID, useValue: "el-GR" }],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach progress behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <button type="button" data-testid="block-3-4" (click)="value.set(3)">3/4</button>
    <button type="button" data-testid="block-unmount" (click)="mounted.set(false)">Unmount</button>
    <button type="button" data-testid="block-mount" (click)="mounted.set(true)">Mount</button>
    <output data-testid="block-value">{{ value() }}</output>

    @if (mounted()) {
      @defer (hydrate on interaction) {
        <section data-testid="block">
          <h3 id="block-title" data-testid="block-title">Βήματα</h3>
          <progress-step-bar
            data-testid="block-steps"
            [value]="value()"
            max="4"
            titleId="block-title"
          />
        </section>
      } @placeholder {
        <p>Deferred step bar</p>
      }
    }
  `,
})
export class ProgressBlockFixture {
  readonly attached = signal(false);
  readonly value = signal(2);
  readonly mounted = signal(true);
}
