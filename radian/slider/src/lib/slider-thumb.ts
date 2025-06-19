import {
  computed,
  Directive,
  ElementRef,
  inject,
  Injector,
  input,
} from '@angular/core';
import { RadianSliderContext } from './slider-context';
import { clampNumber, elementSize } from '@loozo/radian/common';
import { linearScale } from './linear-scale';
import { RadianSliderThumbContext } from './slider-thumb-context';

@Directive({
  selector: '[radianSliderThumb]',
  providers: [
    {
      provide: RadianSliderContext,
      useFactory: RadianSliderThumb.contextFactory,
    },
  ],
  host: {
    '[style]': 'style()',
  },
})
export class RadianSliderThumb {
  /**
   * Name of the form control. Submitted with the form as part of a name/value pair.
   */
  name = input<string>();

  private context = inject(RadianSliderContext);
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  private index = computed(() =>
    this.context
      .thumbs()
      .findIndex((e) => e.nativeElement === this.elementRef.nativeElement),
  );
  private value = computed(() => this.context.values()[this.index()]);
  private percent = computed(() =>
    this.value() == undefined
      ? 0
      : this.convertValueToPercentage(
          this.value(),
          this.context.min(),
          this.context.max(),
        ),
  );

  private size = elementSize({
    elementRef: this.elementRef,
    injector: inject(Injector),
  });
  private orientationSize = computed(() => this.size()?.[this.context.size()]);
  private thumbInBoundsOffset = computed(() =>
    this.orientationSize()
      ? this.getThumbInBoundsOffset(
          this.orientationSize(),
          this.percent(),
          this.context.slideDirection(),
        )
      : 0,
  );
  private edgeOffset = computed(
    () => `calc(${this.percent()}% + ${this.thumbInBoundsOffset()}px)`,
  );
  protected top = computed(() => {
    if (this.context.startEdge() === 'top') {
      return this.edgeOffset();
    }

    return '';
  });
  protected right = computed(() => {
    if (this.context.startEdge() === 'right') {
      return this.edgeOffset();
    }

    return '';
  });
  protected bottom = computed(() => {
    if (this.context.startEdge() === 'bottom') {
      return this.edgeOffset();
    }

    return '';
  });
  protected left = computed(() => {
    if (this.context.startEdge() === 'left') {
      return this.edgeOffset();
    }

    return '';
  });
  protected style = computed(() => ({
    transform: 'var(--radix-slider-thumb-transform)',
    position: 'absolute',
    [this.context.startEdge()]: this.edgeOffset(),
  }));

  private convertValueToPercentage(value: number, min: number, max: number) {
    const maxSteps = max - min;
    const percentPerStep = 100 / maxSteps;
    const percentage = percentPerStep * (value - min);

    return clampNumber(percentage, [0, 100]);
  }

  private getThumbInBoundsOffset(
    width: number,
    left: number,
    direction: number,
  ) {
    const halfWidth = width / 2;
    const halfPercent = 50;
    const offset = linearScale([0, halfPercent], [0, halfWidth]);

    return (halfWidth - offset(left) * direction) * direction;
  }

  private static contextFactory(): RadianSliderThumbContext {
    const {
      thumbFocused,
      name: sliderName,
      ...context
    } = inject(RadianSliderContext);
    const sliderThumb = inject(RadianSliderThumb);

    return {
      ...context,
      index: sliderThumb.index,
      value: sliderThumb.value,
      name: computed(() => {
        const name = sliderThumb.name();

        if (name) {
          return name;
        }

        const groupName = sliderName();

        if (!groupName) {
          return;
        }

        return `${groupName}${context.values().length > 1 ? '[]' : ''}`;
      }),
      focused() {
        thumbFocused(sliderThumb.index());
      },
    };
  }
}
