import { contentChild, Directive } from '@angular/core';
import { RadianEnum } from '@loozo/radian/common';
import { RadianPopperAnchor } from './popper-anchor';

export const RadianPopperSide = {
  Top: 'top',
  Right: 'right',
  Bottom: 'bottom',
  Left: 'left',
} as const;

export type RadianPopperSide = RadianEnum<typeof RadianPopperSide>;

export const RadianPopperAlign = {
  Start: 'start',
  Center: 'center',
  End: 'end',
} as const;

export type RadianPopperAlign = RadianEnum<typeof RadianPopperAlign>;

@Directive({})
export class RadianPopperContext {
  anchor = contentChild.required(RadianPopperAnchor);
}
