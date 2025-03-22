import { Directive } from '@angular/core';
import { RadianDialogDescription } from '@loozo/radian/dialog';

@Directive({
  selector: '[radianAlertDialogDescription]',
  hostDirectives: [RadianDialogDescription],
})
export class RadianAlertDialogDescription {}
