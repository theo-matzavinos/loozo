import { RadianEnum } from '@loozo/radian/common';

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
