import { ElementRef, InjectionToken, Signal } from '@angular/core';
import { Direction } from '@loozo/radian/common';

export type RadianMenubarContext = {
  value: Signal<string>;
  dir: Signal<Direction>;
  loop: Signal<boolean>;
  triggers: Signal<readonly ElementRef<HTMLButtonElement>[]>;
  openMenu(value: string): void;
  closeMenu(): void;
  toggleMenu(value: string): void;
};

export const RadianMenubarContext = new InjectionToken<RadianMenubarContext>(
  '[Radian] Menubar Context',
);
