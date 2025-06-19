import { booleanAttribute, Directive, input } from '@angular/core';
import { uniqueId } from '@loozo/radian/common';
import { RadianSubMenuTrigger } from '@loozo/radian/menu';

@Directive({
  selector: '[radianContextSubMenuTrigger]',
  hostDirectives: [
    { directive: RadianSubMenuTrigger, inputs: ['value', 'disabled'] },
  ],
})
export class RadianContextSubMenuTrigger {
  value = input(uniqueId('radian-sub-menu-trigger'));
  disabled = input(false, { transform: booleanAttribute });
}
