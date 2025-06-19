import { InjectionToken, Signal } from '@angular/core';

export type RadianTabsGroupContext = {
  orientation: Signal<'horizontal' | 'vertical'>;
  dir: Signal<'ltr' | 'rtl'>;
  loop: Signal<boolean>;
  activationMode: Signal<'automatic' | 'manual'>;
  active: Signal<string>;
  setActive(id: string): void;
};

export const RadianTabsGroupContext =
  new InjectionToken<RadianTabsGroupContext>('[Radian] Tabs Group Context');
