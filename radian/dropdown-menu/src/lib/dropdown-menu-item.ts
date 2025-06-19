import { booleanAttribute, Directive, inject, input } from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { uniqueId } from '@loozo/radian/common';
import { RadianMenuItem } from '@loozo/radian/menu';

@Directive({
  selector: '[radianDropdownMenuItem]',
  hostDirectives: [
    { directive: RadianMenuItem, inputs: ['value', 'disabled'] },
  ],
})
export class RadianDropdownMenuItem {
  value = input(uniqueId('radian-menu-item'));
  disabled = input(false, { transform: booleanAttribute });

  // eslint-disable-next-line @angular-eslint/no-output-native
  select = outputFromObservable(
    outputToObservable(inject(RadianMenuItem).select),
  );
}
