import { Directive, inject, input } from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianMenuRadioGroup } from '@loozo/radian/menu';

@Directive({
  selector: '[radianDropdownMenuRadioGroup]',
  hostDirectives: [{ directive: RadianMenuRadioGroup, inputs: ['value'] }],
})
export class RadianDropdownMenuRadioGroup {
  value = input<string | undefined>();

  valueChange = outputFromObservable(
    outputToObservable(inject(RadianMenuRadioGroup).valueChange),
  );
}
