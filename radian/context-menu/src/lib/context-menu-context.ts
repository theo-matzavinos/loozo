import { ElementRef, InjectionToken, Signal } from '@angular/core';

export type RadianContextMenuContext = {
  triggerId: Signal<string>;
  trigger: Signal<ElementRef<HTMLButtonElement>>;
  contentId: Signal<string>;
  open: Signal<boolean>;
  setOpen(open: boolean): void;
  toggle(): void;
  modal: Signal<boolean>;
};

export const RadianContextMenuContext =
  new InjectionToken<RadianContextMenuContext>('[Radian] Context Menu Context');
