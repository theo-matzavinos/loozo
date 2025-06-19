import { Signal, InjectionToken } from '@angular/core';
import { RadianOrientation } from '@loozo/radian/common';

export type RadianAccordionItemContext = {
  orientation: Signal<RadianOrientation>;
  open: Signal<boolean>;
  disabled: Signal<boolean>;
  triggerId: Signal<string>;
};

export const RadianAccordionItemContext =
  new InjectionToken<RadianAccordionItemContext>(
    '[Radian] Accordion Item Context',
  );
