import { InjectionToken, Signal } from '@angular/core';

export type RadianRadioGroupItemContext = {
  value: Signal<string>;
  disabled: Signal<boolean>;
};

export const RadianRadioGroupItemContext =
  new InjectionToken<RadianRadioGroupItemContext>(
    '[Radian] Radio Group Item Context',
  );
