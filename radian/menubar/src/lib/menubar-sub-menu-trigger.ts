import { booleanAttribute, Directive, input } from '@angular/core';
import { uniqueId } from '@loozo/radian/common';
import { RadianSubMenuTrigger } from '@loozo/radian/menu';

@Directive({
  selector: '[radianMenubarSubMenuTrigger]',
  hostDirectives: [
    { directive: RadianSubMenuTrigger, inputs: ['value', 'disabled'] },
  ],
})
export class RadianMenubarSubMenuTrigger {
  value = input(uniqueId('radian-sub-menu-trigger'));
  disabled = input(false, { transform: booleanAttribute });
}
