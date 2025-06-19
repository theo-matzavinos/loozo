import { Directive } from '@angular/core';
import { RadianDialogOverlay } from '@loozo/radian/dialog';

@Directive({
  selector: '[radianAlertDialogOverlay]',
  hostDirectives: [RadianDialogOverlay],
})
export class RadianAlertDialogOverlay {}
