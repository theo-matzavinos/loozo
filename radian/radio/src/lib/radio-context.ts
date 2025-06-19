import { InjectionToken, Signal } from '@angular/core';

export type RadianRadioContext = {
  checked: Signal<boolean | undefined>;
  disabled: Signal<boolean>;
  required: Signal<boolean>;
  value: Signal<string>;
  name: Signal<string | undefined>;
  form: Signal<string | undefined>;
  state: Signal<string | undefined>;
  toggle(): void;
};

export const RadianRadioContext = new InjectionToken<RadianRadioContext>(
  '[Radian] Radio Context',
);
