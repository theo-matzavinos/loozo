import {
  booleanAttribute,
  computed,
  Directive,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { RadianMenuItem } from './menu-item';
import {
  provideRadianMenuItemIndicatorContext,
  RadianMenuItemCheckedState,
} from './menu-item-indicator';
import { uniqueId } from '@loozo/radian/common';

@Directive({
  selector: '[radianMenuItemCheckbox]',
  providers: [
    provideRadianMenuItemIndicatorContext(() => {
      const menuCheckboxItem = inject(RadianMenuCheckboxItem);

      return {
        checked: menuCheckboxItem.checked,
      };
    }),
  ],
  hostDirectives: [
    {
      directive: RadianMenuItem,
      inputs: ['value', 'disabled'],
    },
  ],
  host: {
    role: 'menuitemcheckbox',
    '[attr.aria-checked]':
      'isChecked() ==="indeterminate" ? "mixed" : isChecked()',
    '[attr.data-state]': 'state()',
  },
})
export class RadianMenuCheckboxItem {
  value = input(uniqueId('radian-menu-item'));
  checked = input<RadianMenuItemCheckedState>(false);
  disabled = input(false, { transform: booleanAttribute });
  checkedChange = output<RadianMenuItemCheckedState>();
  // eslint-disable-next-line @angular-eslint/no-output-native
  select = output<Event>();

  protected isChecked = linkedSignal(this.checked);
  protected state = computed(() => {
    const checked = this.isChecked();
    if (checked === 'indeterminate') {
      return checked;
    }

    return checked ? 'checked' : 'unchecked';
  });

  constructor() {
    inject(RadianMenuItem).select.subscribe(() => {
      const checked = this.isChecked();

      if (checked === 'indeterminate') {
        this.isChecked.set(true);
        this.checkedChange.emit(true);

        return;
      }

      this.isChecked.set(!checked);
      this.checkedChange.emit(!checked);
    });
  }
}
