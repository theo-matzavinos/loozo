import { Directive, input } from '@angular/core';
import { RadianToggleGroupItem } from '@loozo/radian/toggle-group';

@Directive({
  selector: '[radianToolbarToggleItem]',
  hostDirectives: [{ directive: RadianToggleGroupItem, inputs: ['value'] }],
})
export class RadianToolbarToggleItem {
  /**
   * A string value for the toggle group item.
   * All items within a toggle group should use a unique value.
   * */
  value = input.required<string>();
}
