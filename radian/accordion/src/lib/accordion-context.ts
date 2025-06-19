import { Signal, InjectionToken } from '@angular/core';
import { RadianOrientation } from '@loozo/radian/common';

export type RadianAccordionContext = {
  orientation: Signal<RadianOrientation>;
  collapsible: Signal<boolean>;
  itemOpened(id: string): void;
  itemClosed(id: string): void;
  isItemOpen(id: string): boolean;
};

export const RadianAccordionContext =
  new InjectionToken<RadianAccordionContext>('[Radian] Accordion Context');
