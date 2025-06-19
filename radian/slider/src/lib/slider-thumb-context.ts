import { ElementRef, InjectionToken, Signal } from '@angular/core';

export type RadianSliderThumbContext = {
  index: Signal<number>;
  value: Signal<number>;
  name: Signal<string | undefined>;
  focused(): void;
  orientation: Signal<'horizontal' | 'vertical'>;
  dir: Signal<'ltr' | 'rtl'>;
  disabled: Signal<boolean>;
  startEdge: Signal<'bottom' | 'top' | 'right' | 'left'>;
  endEdge: Signal<'bottom' | 'top' | 'right' | 'left'>;
  values: Signal<number[]>;
  min: Signal<number>;
  max: Signal<number>;
  thumbs: Signal<readonly ElementRef<HTMLElement>[]>;
  size: Signal<'height' | 'width'>;
  slideDirection: Signal<1 | -1>;
};

export const RadianSliderThumbContext =
  new InjectionToken<RadianSliderThumbContext>('[Radian] Slider Thumb Context');
