import { Directive } from '@angular/core';
import { RadianVisuallyHidden } from '@loozo/radian/visually-hidden';

@Directive({
  selector: '[radianAccessibleIconLabel]',
  hostDirectives: [RadianVisuallyHidden],
})
export class RadianAccessibleIconLabel {}
