import { Component, computed, model } from "@angular/core";
import { OrigamiMeter } from "@loozo/origami-ui/meter";

interface Arrivals {
  readonly period: string;
  readonly percentage: number;
  readonly total: number;
  readonly validated: number;
  readonly pending: number;
}

const periods: readonly Arrivals[] = [
  { period: "08:00 – 10:00", percentage: 75, total: 120, validated: 90, pending: 30 },
  { period: "10:00 – 12:00", percentage: 25, total: 80, validated: 20, pending: 60 },
  { period: "12:00 – 14:00", percentage: 100, total: 40, validated: 40, pending: 0 },
];

// A dashboard's arrivals gauge, named by its heading. The meter is the ring: a masked conic
// gradient sized by --og-meter-percent, registered with @property so it can transition, with the
// value text from State in its centre, aria-hidden because the meter's own aria-valuetext already
// reports it. Without data there's no meter at all, only the dashboard's own placeholder.
@Component({
  selector: "app-arrivals-gauge",
  imports: [OrigamiMeter],
  template: `
    <section class="card">
      <header>
        <h3 id="arrivals-title">Arrivals</h3>
        <select aria-label="Period" (change)="choose($event)">
          @for (option of periods; track option.period; let index = $index) {
            <option [value]="index" [selected]="index === period()">{{ option.period }}</option>
          }
        </select>
      </header>

      @if (arrivals(); as arrivals) {
        <div
          ogMeter
          #gauge="ogMeter"
          class="ring"
          [value]="arrivals.percentage"
          aria-labelledby="arrivals-title"
        >
          <span class="value" aria-hidden="true">{{ gauge.state.valueText() }}</span>
        </div>
      } @else {
        <p class="no-data">No arrivals data for this period</p>
      }

      <dl class="counts">
        <div>
          <dt>Total</dt>
          <dd>{{ arrivals()?.total ?? "–" }}</dd>
        </div>
        <div>
          <dt>Validated</dt>
          <dd>{{ arrivals()?.validated ?? "–" }}</dd>
        </div>
        <div>
          <dt>Pending</dt>
          <dd>{{ arrivals()?.pending ?? "–" }}</dd>
        </div>
      </dl>
    </section>
  `,
  styles: `
    @property --og-meter-percent {
      syntax: "<percentage>";
      inherits: true;
      initial-value: 0%;
    }

    .card {
      display: grid;
      gap: 1rem;
      max-inline-size: 24rem;
      padding: 1rem 1.25rem;
      border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
      border-radius: 0.75rem;
    }

    header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    h3 {
      margin: 0;
      font-size: 1rem;
    }

    select {
      margin-inline-start: auto;
    }

    .ring,
    .no-data {
      justify-self: center;
      inline-size: 10rem;
      aspect-ratio: 1;
      margin: 0;
    }

    .ring {
      display: grid;
      place-items: center;
      transition: --og-meter-percent 400ms ease-out;
    }

    .ring::before {
      content: "";
      grid-area: 1 / 1;
      align-self: stretch;
      justify-self: stretch;
      border-radius: 50%;
      background: conic-gradient(
        #60a5fa var(--og-meter-percent),
        color-mix(in srgb, currentColor 15%, transparent) 0
      );
      mask: radial-gradient(
        farthest-side,
        transparent calc(100% - 1rem),
        #000 calc(100% - 1rem + 1px)
      );
    }

    .value {
      grid-area: 1 / 1;
      font-size: 2rem;
      font-weight: 700;
    }

    @media (prefers-reduced-motion: reduce) {
      .ring {
        transition: none;
      }
    }

    .no-data {
      display: grid;
      place-items: center;
      text-align: center;
      opacity: 0.75;
    }

    .counts {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      margin: 0;
      padding-block-start: 0.75rem;
      border-block-start: 1px solid color-mix(in srgb, currentColor 20%, transparent);
      text-align: center;
    }

    dt {
      font-size: 0.875rem;
      opacity: 0.75;
    }

    dd {
      margin: 0;
      font-weight: 700;
    }
  `,
})
export class ArrivalsGauge {
  /** The index of the chosen period: 75%, 25% or 100% of arrivals validated. */
  readonly period = model(0);
  /** Whether the chosen period has no data: the gauge is replaced by a placeholder. */
  readonly noData = model(false);
  protected readonly periods = periods;
  protected readonly arrivals = computed(() => {
    if (this.noData()) {
      return null;
    }

    return periods[this.period()] ?? null;
  });

  protected choose(event: Event): void {
    const select = event.target as HTMLSelectElement;

    this.period.set(Number(select.value));
  }
}
