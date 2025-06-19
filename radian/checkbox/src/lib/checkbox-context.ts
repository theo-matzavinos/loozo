import { InjectionToken, Signal } from '@angular/core';

export type RadianCheckedState = boolean | 'indeterminate';

export type RadianCheckboxContext = {
  checked: Signal<RadianCheckedState | undefined>;
  disabled: Signal<boolean>;
  required: Signal<boolean>;
  value: Signal<string>;
  name: Signal<string | undefined>;
  form: Signal<string | undefined>;
  state: Signal<'indeterminate' | 'checked' | 'unchecked'>;
  toggle(): void;
};

export const RadianCheckboxContext = new InjectionToken<RadianCheckboxContext>(
  '[Radian] Checkbox Context',
);
