import { computed, Directive, inject } from '@angular/core';
import { RadianSliderContext } from './slider-context';
import { clampNumber } from '@loozo/radian/common';

@Directive({
  selector: '[radianSliderRange]',
  host: {
    '[style]': 'style()',
  },
})
export class RadianSliderRange {
  protected context = inject(RadianSliderContext);
  private valuesCount = computed(() => this.context.values().length);
  private percentages = computed(() =>
    this.context
      .values()
      .map((value) =>
        this.convertValueToPercentage(
          value,
          this.context.min(),
          this.context.max(),
        ),
      ),
  );
  private offsetStart = computed(
    () => `${this.valuesCount() > 1 ? Math.min(...this.percentages()) : 0}%`,
  );
  private offsetEnd = computed(
    () => `${100 - Math.max(...this.percentages())}%`,
  );
  protected style = computed(() => ({
    [this.context.startEdge()]: this.offsetStart(),
    [this.context.endEdge()]: this.offsetEnd(),
  }));

  private convertValueToPercentage(value: number, min: number, max: number) {
    const maxSteps = max - min;
    const percentPerStep = 100 / maxSteps;
    const percentage = percentPerStep * (value - min);

    return clampNumber(percentage, [0, 100]);
  }
}
