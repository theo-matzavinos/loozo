import { booleanAttribute, Directive, inject, input } from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { uniqueId } from '@loozo/radian/common';
import {
  provideRadianDialogDefaults,
  RadianDialog,
} from '@loozo/radian/dialog';

@Directive({
  selector: '[radianAlertDialog]',
  providers: [provideRadianDialogDefaults({ modal: true })],
  hostDirectives: [
    {
      directive: RadianDialog,
      inputs: ['id', 'open'],
    },
  ],
})
export class RadianAlertDialog {
  /** Used to create ids for the children elements. */
  id = input(uniqueId('radian-dialog'));
  /** Controls whether the popover's content is visible. */
  open = input(false, { transform: booleanAttribute });
  /** Emits when the dialog opens or closes. */
  openChange = outputFromObservable(
    outputToObservable(inject(RadianDialog).openChange),
  );
}
