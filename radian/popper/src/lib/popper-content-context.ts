import { InjectionToken, Signal } from '@angular/core';
import { RadianPopperAlignment, RadianPopperSide } from './types';

export type RadianPopperContentContext = {
  placedSide: Signal<RadianPopperSide | undefined>;
  arrowX: Signal<number | undefined>;
  arrowY: Signal<number | undefined>;
  shouldHideArrow: Signal<boolean>;
  placedAlign: Signal<RadianPopperAlignment | undefined>;
  isPositioned: Signal<boolean>;
};

export const RadianPopperContentContext =
  new InjectionToken<RadianPopperContentContext>(
    '[Radian] Popper Content Context',
  );
