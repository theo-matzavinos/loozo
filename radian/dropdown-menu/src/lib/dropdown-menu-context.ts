import { ElementRef, InjectionToken, Signal } from '@angular/core';

export type RadianDropdownMenuContext = {
  triggerId: Signal<string>;
  trigger: Signal<ElementRef<HTMLButtonElement>>;
  contentId: Signal<string>;
  open: Signal<boolean>;
  setOpen(open: boolean): void;
  toggle(): void;
  modal: Signal<boolean>;
};

export const RadianDropdownMenuContext =
  new InjectionToken<RadianDropdownMenuContext>(
    '[Radian] Dropdown Menu Context',
  );
