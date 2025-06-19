import { Directive, inject, input } from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianMenuRadioGroup } from '@loozo/radian/menu';

@Directive({
  selector: '[radianMenubarRadioGroup]',
  hostDirectives: [{ directive: RadianMenuRadioGroup, inputs: ['value'] }],
})
export class RadianMenubarRadioGroup {
  value = input<string | undefined>();

  valueChange = outputFromObservable(
    outputToObservable(inject(RadianMenuRadioGroup).valueChange),
  );
}
