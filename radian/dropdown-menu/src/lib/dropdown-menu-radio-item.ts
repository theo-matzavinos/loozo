import { booleanAttribute, Directive, inject, input } from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { uniqueId } from '@loozo/radian/common';
import { RadianMenuRadioItem } from '@loozo/radian/menu';

@Directive({
  selector: '[radianDropdownMenuRadioItem]',
  hostDirectives: [
    {
      directive: RadianMenuRadioItem,
      inputs: ['value', 'checked', 'disabled'],
    },
  ],
})
export class RadianDropdownMenuRadioItem {
  value = input(uniqueId('radian-menu-item'));
  checked = input<boolean>(false);
  disabled = input(false, { transform: booleanAttribute });
  private menuRadioItem = inject(RadianMenuRadioItem);
  checkedChange = outputFromObservable(
    outputToObservable(this.menuRadioItem.checkedChange),
  );
  // eslint-disable-next-line @angular-eslint/no-output-native
  select = outputFromObservable(outputToObservable(this.menuRadioItem.select));
}
