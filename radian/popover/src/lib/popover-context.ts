import { ElementRef, InjectionToken, Signal } from '@angular/core';

export type RadianPopoverContext = {
  contentId: Signal<string>;
  modal: Signal<boolean>;
  open: Signal<boolean>;
  trigger: Signal<ElementRef<HTMLElement>>;
  setOpen(open: boolean): void;
  toggle(): void;
};

export const RadianPopoverContext = new InjectionToken<RadianPopoverContext>(
  '[Radian] Popover Context',
);
