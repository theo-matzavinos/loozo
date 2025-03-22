import { Directive } from '@angular/core';
import { RadianDialogClose } from '@loozo/radian/dialog';

@Directive({
  selector: '[radianAlertDialogCancel]',
  hostDirectives: [RadianDialogClose],
})
export class RadianAlertDialogCancel {}
