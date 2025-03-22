import { Directive } from '@angular/core';
import { RadianEnum } from '@loozo/radian/common';
import { RadianPopperContext } from './popper-context';

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

@Directive({
  hostDirectives: [{ directive: RadianPopperContext }],
})
export class RadianPopper {}
