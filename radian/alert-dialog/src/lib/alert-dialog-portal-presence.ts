import { Directive } from '@angular/core';
import { RadianDialogPortalPresence } from '@loozo/radian/dialog';

@Directive({
  selector: '[radianAlertDialogPortalPresence]',
  hostDirectives: [RadianDialogPortalPresence],
})
export class RadianAlertDialogPortalPresence {}
