import { Directive } from '@angular/core';
import { RadianDialogTitle } from '@loozo/radian/dialog';

@Directive({
  selector: '[radianAlertDialogTitle]',
  hostDirectives: [RadianDialogTitle],
})
export class RadianAlertDialogTitle {}
