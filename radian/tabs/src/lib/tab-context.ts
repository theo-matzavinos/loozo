import { Signal, InjectionToken } from '@angular/core';

export type RadianTabContext = {
  active: Signal<boolean>;
  state: Signal<'active' | 'inactive'>;
  contentId: Signal<string>;
  triggerId: Signal<string>;
  orientation: Signal<'horizontal' | 'vertical'>;
};

export const RadianTabContext = new InjectionToken<RadianTabContext>(
  '[Radian] Tab Context',
);
