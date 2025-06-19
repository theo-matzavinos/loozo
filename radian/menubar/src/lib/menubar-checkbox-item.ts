import { booleanAttribute, Directive, inject, input } from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { uniqueId } from '@loozo/radian/common';
import {
  RadianMenuCheckboxItem,
  RadianMenuItemCheckedState,
} from '@loozo/radian/menu';

@Directive({
  selector: '[radianMenubarCheckboxItem]',
  hostDirectives: [
    {
      directive: RadianMenuCheckboxItem,
      inputs: ['value', 'checked', 'disabled'],
    },
  ],
})
export class RadianMenubarCheckboxItem {
  value = input(uniqueId('radian-menu-item'));
  checked = input<RadianMenuItemCheckedState>(false);
  disabled = input(false, { transform: booleanAttribute });
  private menuCheckboxItem = inject(RadianMenuCheckboxItem);
  checkedChange = outputFromObservable(
    outputToObservable(this.menuCheckboxItem.checkedChange),
  );
  // eslint-disable-next-line @angular-eslint/no-output-native
  select = outputFromObservable(
    outputToObservable(this.menuCheckboxItem.select),
  );
}
