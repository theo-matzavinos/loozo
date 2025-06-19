import { InjectionToken, Signal } from '@angular/core';

export type RadianMenuRadioGroupContext = {
  value: Signal<string | undefined>;
  setValue(value: string): void;
};

export const RadianMenuRadioGroupContext =
  new InjectionToken<RadianMenuRadioGroupContext>(
    '[Radian] Menu Radio Group Context',
  );
