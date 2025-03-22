import { Directive } from '@angular/core';
import { RadianCollapsibleContentPresence } from '@loozo/radian/collapsible';

@Directive({
  selector: 'ng-template[radianAccordionContentPresence]',
  hostDirectives: [
    {
      directive: RadianCollapsibleContentPresence,
    },
  ],
})
export class RadianAccordionContentPresence {}
