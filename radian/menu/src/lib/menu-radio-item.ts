import {
  booleanAttribute,
  Directive,
  effect,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { RadianMenuItem } from './menu-item';
import { provideRadianMenuItemIndicatorContext } from './menu-item-indicator';
import { uniqueId } from '@loozo/radian/common';
import { RadianMenuRadioGroupContext } from './menu-radio-group-context';

@Directive({
  selector: '[radianMenuItemRadio]',
  providers: [
    provideRadianMenuItemIndicatorContext(() => {
      const menuRadioItem = inject(RadianMenuRadioItem);

      return {
        checked: menuRadioItem.isChecked,
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
    role: 'menuitemradio',
    '[attr.aria-checked]': 'isChecked()',
    '[attr.data-state]': 'isChecked() ? "checked" : "unchecked"',
  },
})
export class RadianMenuRadioItem {
  value = input(uniqueId('radian-menu-item'));
  checked = input<boolean>(false);
  disabled = input(false, { transform: booleanAttribute });
  checkedChange = output<boolean>();
  // eslint-disable-next-line @angular-eslint/no-output-native
  select = output<Event>();

  protected isChecked = linkedSignal(this.checked);

  constructor() {
    const radioGroupContext = inject(RadianMenuRadioGroupContext);

    effect(() => {
      if (radioGroupContext.value() === this.value() && !this.isChecked()) {
        this.isChecked.set(true);
        this.checkedChange.emit(true);
      } else if (
        radioGroupContext.value() !== this.value() &&
        this.isChecked()
      ) {
        this.isChecked.set(false);
        this.checkedChange.emit(false);
      }
    });

    effect(() => {
      if (this.isChecked()) {
        radioGroupContext.setValue(this.value());
      } else if (radioGroupContext.value() === this.value()) {
        radioGroupContext.setValue('');
      }
    });

    inject(RadianMenuItem).select.subscribe(() => {
      if (!this.isChecked()) {
        radioGroupContext.setValue(this.value());
        this.isChecked.set(true);
        this.checkedChange.emit(true);
      }
    });
  }
}
