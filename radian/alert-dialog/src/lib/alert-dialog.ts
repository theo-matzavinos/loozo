import { booleanAttribute, Directive, inject, input } from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
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
      inputs: ['open'],
    },
  ],
})
export class RadianAlertDialog {
  open = input(false, { transform: booleanAttribute });
  openChange = outputFromObservable(
    outputToObservable(inject(RadianDialog).open),
  );
}
