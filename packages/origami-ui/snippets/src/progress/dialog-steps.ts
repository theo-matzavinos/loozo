import { Component, computed, model, signal } from "@angular/core";
import { OrigamiProgress } from "@loozo/origami-ui/progress";

// A dialog's step bar, named by the dialog's title. The fill is a child sized by
// --og-progress-percent; a warning step changes the total; while loading the bar has no value,
// so it's indeterminate and animates. The visible step text is aria-hidden: the bar's own
// aria-valuetext already reports it.
@Component({
  selector: "app-dialog-steps",
  imports: [OrigamiProgress],
  template: `
    <section class="card">
      <h3 id="schedule-title">Change schedule</h3>
      <div
        ogProgress
        #bar="ogProgress"
        class="bar"
        [value]="value()"
        [max]="steps()"
        [valueText]="stepText()"
        aria-labelledby="schedule-title"
      >
        <span class="fill"></span>
      </div>
      <p class="status" aria-hidden="true">{{ bar.state.valueText() }}</p>
      <div class="actions">
        <button type="button" (click)="previous()" [disabled]="loading() || step() === 1">
          Previous
        </button>
        <button type="button" (click)="next()" [disabled]="loading() || step() >= steps()">
          Next
        </button>
      </div>
    </section>
  `,
  styles: `
    .card {
      display: grid;
      gap: 0.75rem;
      max-inline-size: 24rem;
      padding: 1rem 1.25rem;
      border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
      border-radius: 0.75rem;
    }

    h3 {
      margin: 0;
      font-size: 1rem;
    }

    .bar {
      position: relative;
      block-size: 0.25rem;
      overflow: hidden;
      border-radius: 999px;
      background: color-mix(in srgb, currentColor 20%, transparent);
    }

    .fill {
      display: block;
      block-size: 100%;
      inline-size: var(--og-progress-percent);
      border-radius: inherit;
      background: #60a5fa;
      transition: inline-size 200ms ease-out;
    }

    .bar[data-complete] .fill {
      background: #4ade80;
    }

    .bar[data-indeterminate] .fill {
      inline-size: 40%;
      animation: slide 1.2s ease-in-out infinite;
    }

    @keyframes slide {
      from {
        translate: -100% 0;
      }
      to {
        translate: 250% 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .fill {
        transition: none;
      }

      .bar[data-indeterminate] .fill {
        inline-size: 100%;
        animation: none;
        opacity: 0.5;
      }
    }

    .status {
      margin: 0;
      font-size: 0.875rem;
      opacity: 0.75;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }
  `,
})
export class DialogSteps {
  /** Whether the flow has its extra warning step, which makes four steps instead of three. */
  readonly warning = model(false);
  /** While loading, the bar has no value: its progress is unknown. */
  readonly loading = model(false);
  readonly step = signal(1);
  readonly steps = computed(() => {
    if (this.warning()) {
      return 4;
    }

    return 3;
  });
  readonly value = computed(() => {
    if (this.loading()) {
      return null;
    }

    return Math.min(this.step(), this.steps());
  });
  readonly stepText = computed(() => {
    if (this.loading()) {
      return "Loading…";
    }

    return `Step ${this.value()} of ${this.steps()}`;
  });

  previous(): void {
    this.step.update((step) => Math.max(1, Math.min(step, this.steps()) - 1));
  }

  next(): void {
    this.step.update((step) => Math.min(this.steps(), step + 1));
  }
}
