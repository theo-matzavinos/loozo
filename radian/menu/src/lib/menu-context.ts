import { InjectionToken, Signal, WritableSignal } from '@angular/core';

export type RadianMenuContext = {
  open: Signal<boolean>;
  dir: Signal<'ltr' | 'rtl'>;
  modal: Signal<boolean>;
  isUsingKeyboard: Signal<boolean>;
  content: WritableSignal<HTMLElement | undefined>;
  toggle(): void;
  close(): void;
  setOpen(open: boolean): void;
};

export const RadianMenuContext = new InjectionToken<RadianMenuContext>(
  '[Radian] Menu Context',
);

export const RadianRootMenuContext = new InjectionToken<RadianMenuContext>(
  '[Radian] Root Menu Context',
);
