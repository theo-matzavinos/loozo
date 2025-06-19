import { Directive } from '@angular/core';
import { RadianDialogTrigger } from '@loozo/radian/dialog';

@Directive({
  selector: '[radianAlertDialogTrigger]',
  hostDirectives: [RadianDialogTrigger],
})
export class RadianAlertDialogTrigger {}
