import {
  computed,
  Directive,
  effect,
  inject,
  input,
  isDevMode,
  numberAttribute,
} from '@angular/core';
import { RadianProgressContext } from './progress-context';

@Directive({
  selector: '[radianProgress]',
  exportAs: 'radianProgress',
  providers: [
    {
      provide: RadianProgressContext,
      useFactory: RadianProgress.contextFactory,
    },
  ],
  host: {
    role: 'progressbar',
    'aria-valuemin': '0',
    '[attr.aria-valuemax]': 'max()',
    '[attr.aria-valuenow]': 'value()',
    '[attr.aria-valuetext]': 'computedLabel()',
    '[data-state]': 'state()',
    '[attr.data-value]': 'value()',
    '[attr.data-max]': 'max()',
  },
})
export class RadianProgress {
  /** Current value of the progress bar. */
  value = input(NaN, { transform: numberAttribute });
  /** Maximum value of the progress bar. */
  max = input(100, { transform: numberAttribute });
  /** Accessible label. */
  label = input<string>();

  private isValueValid = computed(
    () =>
      !(isNaN(this.value()) || this.value() < 0 || this.value() > this.max()),
  );

  /** Actual label of this progress bar. */
  computedLabel = computed(() => {
    if (!this.isValueValid()) {
      return null;
    }

    return this.label() ?? `${Math.round((this.value() / this.max()) * 100)}%`;
  });

  /** Current state of the progress bar. */
  state = computed(() => {
    if (!this.isValueValid()) {
      return 'indeterminate';
    }

    if (this.value() === this.max()) {
      return 'complete';
    }

    return 'loading';
  });

  constructor() {
    if (isDevMode()) {
      effect(() => {
        if (isNaN(this.max()) || this.max() === 0) {
          console.error(`Invalid value for input 'max': ${this.max()}.`);
        }
      });
      effect(() => {
        if (!this.isValueValid()) {
          console.error(`Invalid value for input 'value': ${this.value()}.`);
        }
      });
    }
  }

  private static contextFactory(): RadianProgressContext {
    const progress = inject(RadianProgress);

    return {
      max: progress.max,
      state: progress.state,
      value: progress.value,
    };
  }
}
