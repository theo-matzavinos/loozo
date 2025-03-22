import { Directive } from '@angular/core';
import { RadianDialogPortalPresence } from '@loozo/radian/dialog';

@Directive({
  selector: '[radianAlertDialogPresence]',
  hostDirectives: [RadianDialogPortalPresence],
})
export class RadianAlertDialogPresence {}
