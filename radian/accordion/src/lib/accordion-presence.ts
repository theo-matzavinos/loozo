import { Directive } from '@angular/core';
import { RadianCollapsiblePresence } from '@loozo/radian/collapsible';

@Directive({
  selector: '[radianAccordionPresence]',
  hostDirectives: [RadianCollapsiblePresence],
})
export class RadianAccordionPresence {}
