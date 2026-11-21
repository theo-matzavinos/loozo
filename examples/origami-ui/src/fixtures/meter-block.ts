import { Component, LOCALE_ID, signal } from "@angular/core";
import { OrigamiMeter } from "@loozo/origami-ui/meter";

// ME7: an arrivals gauge in its own `@defer (hydrate on interaction)` block, bound to a signal of
// the hydrated route component, whose controls stay outside the block so they don't hydrate it.
@Component({
  selector: "acceptance-meter-block-fixture",
  imports: [OrigamiMeter],
  providers: [{ provide: LOCALE_ID, useValue: "el-GR" }],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach meter behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <button type="button" data-testid="block-25" (click)="value.set(25)">25</button>
    <button type="button" data-testid="block-unmount" (click)="mounted.set(false)">Unmount</button>
    <button type="button" data-testid="block-mount" (click)="mounted.set(true)">Mount</button>
    <output data-testid="block-value">{{ value() }}</output>

    @if (mounted()) {
      @defer (hydrate on interaction) {
        <section data-testid="block">
          <h3 id="block-title" data-testid="block-title">Αφίξεις</h3>
          <div
            ogMeter
            #gauge="ogMeter"
            data-testid="block-gauge"
            [value]="value()"
            aria-labelledby="block-title"
          >
            <span aria-hidden="true">{{ gauge.state.valueText() }}</span>
          </div>
        </section>
      } @placeholder {
        <p>Deferred gauge</p>
      }
    }
  `,
})
export class MeterBlockFixture {
  readonly attached = signal(false);
  readonly value = signal(75);
  readonly mounted = signal(true);
}
