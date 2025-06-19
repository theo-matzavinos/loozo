import {
  ElementRef,
  InjectionToken,
  Signal,
  WritableSignal,
} from '@angular/core';

export type RadianMenubarMenuContext = {
  open: Signal<boolean>;
  value: Signal<string>;
  triggerId: Signal<string>;
  trigger: Signal<ElementRef<HTMLElement>>;
  contentId: Signal<string>;
  wasKeyboardTriggerOpen: WritableSignal<boolean>;
};

export const RadianMenubarMenuContext =
  new InjectionToken<RadianMenubarMenuContext>('[Radian] Menubar Menu Context');
