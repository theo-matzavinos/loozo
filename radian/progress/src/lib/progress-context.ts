import { InjectionToken, Signal } from '@angular/core';

export type RadianProgressContext = {
  state: Signal<'indeterminate' | 'complete' | 'loading'>;
  value: Signal<number>;
  max: Signal<number>;
};

export const RadianProgressContext = new InjectionToken<RadianProgressContext>(
  '[Radian] Progress Context',
);
