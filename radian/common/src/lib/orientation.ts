import { RadianEnum } from './enum';

export const RadianOrientation = {
  Horizontal: 'horizontal',
  Vertical: 'vertical',
} as const;

export type RadianOrientation = RadianEnum<typeof RadianOrientation>;
