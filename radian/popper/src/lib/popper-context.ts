import { InjectionToken, Signal } from '@angular/core';
import { RadianPopperAnchor } from './popper-anchor';

export type RadianPopperContext = {
  anchor: Signal<RadianPopperAnchor>;
};

export const RadianPopperContext = new InjectionToken<RadianPopperContext>(
  '[Radian] Popper Context',
);
