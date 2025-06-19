import { InjectionToken, Signal } from '@angular/core';

export type RadianSelectItemContext = {
  value: Signal<string>;
  disabled: Signal<boolean>;
  textId: string;
  isSelected: Signal<boolean>;
};

export const RadianSelectItemContext =
  new InjectionToken<RadianSelectItemContext>('[Radian] Select Item Context');
