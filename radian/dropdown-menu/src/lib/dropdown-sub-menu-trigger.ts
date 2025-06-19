import { booleanAttribute, Directive, input } from '@angular/core';
import { uniqueId } from '@loozo/radian/common';
import { RadianSubMenuTrigger } from '@loozo/radian/menu';

@Directive({
  selector: '[radianDropdownSubMenuTrigger]',
  hostDirectives: [
    { directive: RadianSubMenuTrigger, inputs: ['value', 'disabled'] },
  ],
})
export class RadianDropdownSubMenuTrigger {
  value = input(uniqueId('radian-sub-menu-trigger'));
  disabled = input(false, { transform: booleanAttribute });
}
