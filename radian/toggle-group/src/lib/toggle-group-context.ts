import { InjectionToken, Signal } from '@angular/core';

export type RadianToggleGroupContext = {
  orientation: Signal<'horizontal' | 'vertical'>;
  dir: Signal<'ltr' | 'rtl'>;
  multiple: Signal<boolean>;
  value: Signal<string | string[] | undefined>;
  disabled: Signal<boolean>;
  isItemActive(value: string): boolean;
  itemActivated(value: string): void;
  itemDeactivated(value: string): void;
};

export const RadianToggleGroupContext =
  new InjectionToken<RadianToggleGroupContext>('[Radian] Toggle Group Context');
