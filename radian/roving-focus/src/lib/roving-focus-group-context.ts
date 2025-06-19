import { InjectionToken, Signal } from '@angular/core';

export type RadianRovingFocusGroupContext = {
  active: Signal<string | undefined>;
  orientation: Signal<'horizontal' | 'vertical'>;
  onItemFocused(event: FocusEvent, value: string): void;
  dir: Signal<'ltr' | 'rtl'>;
  loop?: Signal<boolean>;
  defaultActive?: Signal<string>;
  preventScrollOnItemFocus?: Signal<boolean>;
  disabled?: Signal<boolean>;
};

export const RadianRovingFocusGroupContext =
  new InjectionToken<RadianRovingFocusGroupContext>(
    '[RadianRovingFocus] Roving Focus Group Context',
  );
