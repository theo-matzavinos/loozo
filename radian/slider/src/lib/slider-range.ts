import { computed, Directive, inject } from '@angular/core';
import { RadianSliderContext } from './slider';
import { clampNumber } from '@loozo/radian/common';

@Directive({
  selector: '[radianSliderRange]',
  host: {
    'data-radian-slider-range': '',
    '[style]': `{
      top: top(),
      right: right(),
      bottom: bottom(),
      left: left(),
    }`,
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
  protected top = computed(() => {
    if (this.context.startEdge() === 'top') {
      return this.offsetStart();
    }

    if (this.context.endEdge() === 'top') {
      return this.offsetEnd();
    }

    return '';
  });
  protected right = computed(() => {
    if (this.context.startEdge() === 'right') {
      return this.offsetStart();
    }

    if (this.context.endEdge() === 'right') {
      return this.offsetEnd();
    }

    return '';
  });
  protected bottom = computed(() => {
    if (this.context.startEdge() === 'bottom') {
      return this.offsetStart();
    }

    if (this.context.endEdge() === 'bottom') {
      return this.offsetEnd();
    }

    return '';
  });
  protected left = computed(() => {
    if (this.context.startEdge() === 'left') {
      return this.offsetStart();
    }

    if (this.context.endEdge() === 'left') {
      return this.offsetEnd();
    }

    return '';
  });

  private convertValueToPercentage(value: number, min: number, max: number) {
    const maxSteps = max - min;
    const percentPerStep = 100 / maxSteps;
    const percentage = percentPerStep * (value - min);

    return clampNumber(percentage, [0, 100]);
  }
}
