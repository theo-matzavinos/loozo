import { Signal, InjectionToken } from '@angular/core';

export type RadianSwitchContext = {
  checked: Signal<boolean | undefined>;
  disabled: Signal<boolean>;
  required: Signal<boolean>;
  value: Signal<string>;
  name: Signal<string | undefined>;
  form: Signal<string | undefined>;
  state: Signal<'checked' | 'unchecked'>;
  toggle(): void;
};

export const RadianSwitchContext = new InjectionToken<RadianSwitchContext>(
  '[Radian] Switch Context',
);
