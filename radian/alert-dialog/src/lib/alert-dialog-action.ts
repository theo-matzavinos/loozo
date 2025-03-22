import { Directive } from '@angular/core';
import { RadianDialogClose } from '@loozo/radian/dialog';

@Directive({
  selector: '[radianAlertDialogAction]',
  hostDirectives: [RadianDialogClose],
})
export class RadianAlertDialogAction {}
