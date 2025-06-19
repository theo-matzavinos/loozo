import { ElementRef, InjectionToken, Signal } from '@angular/core';

export type RadianSliderContext = {
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
  name: Signal<string | undefined>;
  slideDirection: Signal<1 | -1>;
  thumbFocused(index: number): void;
};

export const RadianSliderContext = new InjectionToken<RadianSliderContext>(
  '[Radian] Slider Context',
);
