import {
  booleanAttribute,
  computed,
  contentChildren,
  Directive,
  ElementRef,
  inject,
  input,
  linkedSignal,
  model,
  numberAttribute,
  signal,
} from '@angular/core';
import {
  clampNumber,
  RadianArrowKeys,
  RadianControlValueAccessor,
  RadianDirection,
  Direction,
  RadianEnum,
  RadianKey,
  RadianOrientation,
  RadianPageKeys,
} from '@loozo/radian/common';
import { RadianSliderThumb } from './slider-thumb';
import { linearScale } from './linear-scale';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianSliderContext } from './slider-context';

const RadianSlideDirection = {
  FromLeft: 'from-left',
  FromRight: 'from-right',
  FromBottom: 'from-bottom',
  FromTop: 'from-top',
} as const;

type RadianSlideDirection = RadianEnum<typeof RadianSlideDirection>;

const RadianSliderBackKeys: Record<RadianSlideDirection, string[]> = {
  [RadianSlideDirection.FromLeft]: [
    RadianKey.Home,
    RadianKey.PageDown,
    RadianKey.ArrowDown,
    RadianKey.ArrowLeft,
  ],
  [RadianSlideDirection.FromRight]: [
    RadianKey.Home,
    RadianKey.PageDown,
    RadianKey.ArrowDown,
    RadianKey.ArrowRight,
  ],
  [RadianSlideDirection.FromBottom]: [
    RadianKey.Home,
    RadianKey.PageDown,
    RadianKey.ArrowDown,
    RadianKey.ArrowLeft,
  ],
  [RadianSlideDirection.FromTop]: [
    RadianKey.Home,
    RadianKey.PageDown,
    RadianKey.ArrowUp,
    RadianKey.ArrowLeft,
  ],
};

@Directive({
  selector: '[radianSlider]',
  exportAs: 'radianSlider',
  providers: [
    { provide: RadianSliderContext, useFactory: RadianSlider.contextFactory },
  ],
  hostDirectives: [
    {
      directive: RadianControlValueAccessor,
      inputs: ['value', 'disabled'],
    },
    { directive: RadianDirection, inputs: ['radianDirection:dir'] },
  ],
  host: {
    '[attr.aria-disabled]': 'controlValueAccessor.disabled() || null',
    '[attr.data-orientation]': 'orientation()',
    '[attr.data-disabled]': 'controlValueAccessor.disabled() || null',
    '[style]': `{
      '--radian-slider-thumb-transform': orientation() === 'vertical' ? 'translateY(50%)' : 'translateX(-50%)',
    }`,
    '(pointerdown)': 'pointerDown($event)',
    '(pointermove)': 'pointerMove($event)',
    '(pointerup)': 'pointerUp($event)',
    '(keydown)': 'keyDown($event)',
  },
})
export class RadianSlider {
  /** Whether this control is disabled. */
  disabled = input(false, {
    transform: booleanAttribute,
  });
  /**
   * Name of the form control. Submitted with the form as part of a name/value pair.
   */
  name = input<string>();
  /**
   * The orientation of the slider.
   * Mainly so arrow navigation is done accordingly (left & right vs. up & down)
   */
  orientation = input<RadianOrientation>(RadianOrientation.Horizontal);
  /**
   * The direction of navigation between items.
   */
  dir = input<Direction>();
  /** The minimum value for the range. */
  min = input(0, { transform: numberAttribute });
  /** The maximum value for the range. */
  max = input(100, { transform: numberAttribute });
  /** The stepping interval. */
  step = input(1, { transform: numberAttribute });
  /** The minimum permitted steps between multiple thumbs. */
  minStepsBetweenThumbs = input(0, { transform: numberAttribute });
  /**
   * Whether keyboard navigation should loop around.
   */
  loop = input(true, { transform: booleanAttribute });
  /**
   * The current value of the slider.
   * Emits on change.
   */
  _values = model<number[]>();
  /**
   * Associates the control with a form element.
   */
  form = input<string>();
  /** Whether the slider is visually inverted. */
  inverted = input(false, { transform: booleanAttribute });

  protected controlValueAccessor = inject<RadianControlValueAccessor<number[]>>(
    RadianControlValueAccessor,
  );
  /** Emits when the value of the slider changes */
  valueChange = outputFromObservable(
    outputToObservable(this.controlValueAccessor.valueChange),
  );

  private currentValues = linkedSignal(
    () => this.controlValueAccessor.value() ?? [],
  );
  protected valuesBeforeSlideStart = signal<number[]>([]);
  private direction = inject(RadianDirection);
  protected startEdge = computed(() => {
    if (this.orientation() === 'vertical') {
      return this.inverted() ? 'bottom' : 'top';
    }

    if (this.direction.value() === Direction.LeftToRight) {
      return this.inverted() ? 'right' : 'left';
    }

    return this.inverted() ? 'left' : 'right';
  });
  protected endEdge = computed(() => {
    if (this.orientation() === 'vertical') {
      return this.inverted() ? 'top' : 'bottom';
    }

    if (this.direction.value() === Direction.LeftToRight) {
      return this.inverted() ? 'left' : 'right';
    }

    return this.inverted() ? 'right' : 'left';
  });
  protected size = computed(() =>
    this.orientation() === 'vertical' ? 'height' : 'width',
  );
  protected slideDirection = computed(() => {
    if (this.orientation() === 'vertical') {
      return this.inverted()
        ? RadianSlideDirection.FromBottom
        : RadianSlideDirection.FromTop;
    }

    if (this.direction.value() === Direction.LeftToRight) {
      return this.inverted()
        ? RadianSlideDirection.FromRight
        : RadianSlideDirection.FromLeft;
    }

    return this.inverted()
      ? RadianSlideDirection.FromLeft
      : RadianSlideDirection.FromRight;
  });
  protected backKeys = computed(
    () => RadianSliderBackKeys[this.slideDirection()],
  );
  private valueIndexToChange = signal(-1);
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private rect = signal<DOMRect | undefined>(undefined);
  private thumbs = contentChildren<RadianSliderThumb, ElementRef<HTMLElement>>(
    RadianSliderThumb,
    { descendants: true, read: ElementRef },
  );

  protected pointerDown(event: PointerEvent) {
    const target = event.target as HTMLElement;

    target.setPointerCapture(event.pointerId);
    this.valuesBeforeSlideStart.set(this.currentValues());

    // Prevent browser focus behaviour because we focus a thumb manually when values change.
    event.preventDefault();
    // Touch devices have a delay before focusing so won't focus if touch immediately moves
    // away from target (sliding). We want thumb to focus regardless.
    if (this.thumbs().some((e) => e.nativeElement === target)) {
      target.focus();
    } else {
      this.slideStarted(event);
    }
  }

  protected pointerMove(event: PointerEvent) {
    const target = event.target as HTMLElement;

    if (target.hasPointerCapture(event.pointerId)) {
      this.slideMoved(event);
    }
  }

  protected pointerUp(event: PointerEvent) {
    const target = event.target as HTMLElement;

    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);

      this.slideEnded();
    }
  }

  protected keyDown(event: KeyboardEvent) {
    if (this.controlValueAccessor.disabled()) {
      return;
    }

    if (event.key === RadianKey.Home) {
      event.preventDefault();
      this.updateValues({
        value: this.min(),
        index: 0,
        commit: true,
      });

      return;
    }

    if (event.key === RadianKey.End) {
      event.preventDefault();
      this.updateValues({
        value: this.max(),
        index: this.currentValues().length - 1,
        commit: true,
      });

      return;
    }

    const isPageKey = RadianPageKeys.includes(event.key);
    const isArrowKey = RadianArrowKeys.includes(event.key);

    if (!(isPageKey || isArrowKey)) {
      return;
    }

    // Prevent scrolling for directional key presses
    event.preventDefault();

    const isSkipKey = isPageKey || (event.shiftKey && isArrowKey);
    const multiplier = isSkipKey ? 10 : 1;
    const index = this.valueIndexToChange();
    const value = this.currentValues()[index];
    const stepDirection = this.backKeys().includes(event.key) ? -1 : 1;
    const stepInDirection = this.step() * multiplier * stepDirection;

    this.updateValues({ value: value + stepInDirection, index, commit: true });
  }

  private slideStarted(event: PointerEvent) {
    const value = this.getValueFromPointer(event.clientY);
    const closestIndex = this.getClosestValueIndex(this.currentValues(), value);

    this.updateValues({ value, index: closestIndex });
  }

  private slideMoved(event: PointerEvent) {
    const value = this.getValueFromPointer(event.clientY);

    this.updateValues({ value, index: this.valueIndexToChange() });
  }

  private slideEnded() {
    const prevValue = this.valuesBeforeSlideStart()[this.valueIndexToChange()];
    const nextValue = this.currentValues()[this.valueIndexToChange()];
    const hasChanged = nextValue !== prevValue;

    if (hasChanged) {
      this.controlValueAccessor.setValue(this.currentValues());
    }
  }

  private updateValues({
    value,
    index,
    commit,
  }: {
    value: number;
    index: number;
    commit?: boolean;
  }) {
    const step = this.step();
    const decimalCount = this.getDecimalCount(step);
    const min = this.min();
    const snapToStep = this.roundValue(
      Math.round((value - min) / step) * step + min,
      decimalCount,
    );
    const nextValue = clampNumber(snapToStep, [min, this.max()]);

    this.currentValues.update((prevValues = []) => {
      const nextValues = this.getNextSortedValues(prevValues, nextValue, index);

      if (
        !this.hasMinStepsBetweenValues(
          nextValues,
          this.minStepsBetweenThumbs() * step,
        )
      ) {
        return prevValues;
      }

      this.valueIndexToChange.set(nextValues.indexOf(nextValue));

      const hasChanged = String(nextValues) !== String(prevValues);

      if (!hasChanged) {
        return prevValues;
      }

      if (commit) {
        this.controlValueAccessor.setValue(nextValues);
      }

      return nextValues;
    });
  }

  private getDecimalCount(value: number) {
    return (String(value).split('.')[1] || '').length;
  }

  private getClosestValueIndex(values: number[], nextValue: number) {
    if (values.length === 1) {
      return 0;
    }

    const distances = values.map((value) => Math.abs(value - nextValue));
    const closestDistance = Math.min(...distances);

    return distances.indexOf(closestDistance);
  }

  private roundValue(value: number, decimalCount: number) {
    const rounder = Math.pow(10, decimalCount);

    return Math.round(value * rounder) / rounder;
  }

  private getNextSortedValues(
    prevValues: number[] = [],
    nextValue: number,
    atIndex: number,
  ) {
    const nextValues = [...prevValues];

    nextValues[atIndex] = nextValue;

    return nextValues.sort((a, b) => a - b);
  }

  private hasMinStepsBetweenValues(
    values: number[],
    minStepsBetweenValues: number,
  ) {
    if (minStepsBetweenValues <= 0) {
      return true;
    }

    const stepsBetweenValues = this.getStepsBetweenValues(values);
    const actualMinStepsBetweenValues = Math.min(...stepsBetweenValues);

    return actualMinStepsBetweenValues >= minStepsBetweenValues;
  }

  private getStepsBetweenValues(values: number[]) {
    return values.slice(0, -1).map((value, index) => values[index + 1] - value);
  }

  private getValueFromPointer(pointerPosition: number) {
    const rect =
      this.rect() || this.elementRef.nativeElement.getBoundingClientRect();
    const input: [number, number] = [0, rect.height];
    const min = this.min();
    const max = this.max();
    let output: [number, number];

    if (this.orientation() === 'vertical') {
      output =
        this.slideDirection() === 'from-bottom' ? [max, min] : [min, max];
    } else {
      output = this.slideDirection() === 'from-left' ? [min, max] : [max, min];
    }

    const value = linearScale(input, output);

    this.rect.set(rect);

    return value(pointerPosition - rect.top);
  }

  private static contextFactory(): RadianSliderContext {
    const slider = inject(RadianSlider);
    const controlValueAccessor = inject(RadianControlValueAccessor);
    const direction = inject(RadianDirection);

    return {
      orientation: slider.orientation,
      dir: direction.value,
      disabled: controlValueAccessor.disabled,
      startEdge: slider.startEdge,
      endEdge: slider.endEdge,
      values: slider.currentValues.asReadonly(),
      min: slider.min,
      max: slider.max,
      thumbs: slider.thumbs,
      size: slider.size,
      name: slider.name,
      slideDirection: computed(() => {
        if (
          slider.slideDirection() === RadianSlideDirection.FromLeft ||
          slider.slideDirection() === RadianSlideDirection.FromBottom
        ) {
          return 1;
        }

        return -1;
      }),
      thumbFocused(index: number) {
        slider.valueIndexToChange.set(index);
      },
    };
  }
}
