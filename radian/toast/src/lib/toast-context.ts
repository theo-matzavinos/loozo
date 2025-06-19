import { InjectionToken } from '@angular/core';

export type RadianToastContext = {
  close(): void;
};

export const RadianToastContext = new InjectionToken<RadianToastContext>(
  '[Radian] Toast Context',
);
