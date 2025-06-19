import { InjectionToken } from '@angular/core';

export type RadianSelectGroupContext = {
  labelId: string;
};

export const RadianSelectGroupContext =
  new InjectionToken<RadianSelectGroupContext>('[Radian] Select Group Context');
