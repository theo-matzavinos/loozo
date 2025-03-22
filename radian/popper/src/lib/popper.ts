import {
  contentChild,
  Directive,
  ElementRef,
  inject,
  InjectionToken,
} from '@angular/core';
import { RadianEnum } from '@loozo/radian/common';
import { RadianPopperAnchor } from './popper-anchor';

export const RadianPopperSide = {
  Top: 'top',
  Right: 'right',
  Bottom: 'bottom',
  Left: 'left',
} as const;

export type RadianPopperSide = RadianEnum<typeof RadianPopperSide>;

export const RadianPopperAlignment = {
  Start: 'start',
  Center: 'center',
  End: 'end',
} as const;

export type RadianPopperAlignment = RadianEnum<typeof RadianPopperAlignment>;

export type RadianPopperContext = ReturnType<
  (typeof RadianPopper)['contextFactory']
>;

export const RadianPopperContext = new InjectionToken<RadianPopperContext>(
  '[Radian] Popper Context',
);

@Directive({
  providers: [
    { provide: RadianPopperContext, useFactory: RadianPopper.contextFactory },
  ],
})
export class RadianPopper {
  private anchor = contentChild.required(RadianPopperAnchor, {
    read: ElementRef,
    descendants: true,
  });

  private static contextFactory() {
    const popper = inject(RadianPopper);

    return {
      anchor: popper.anchor,
    };
  }
}
