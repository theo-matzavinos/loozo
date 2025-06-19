import { Directive } from '@angular/core';
import { RadianDialogPresence } from '@loozo/radian/dialog';

@Directive({
  selector: '[radianAlertDialogPresence]',
  hostDirectives: [RadianDialogPresence],
})
export class RadianAlertDialogPresence {}
