import {
  computed,
  Directive,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { RadianControlValueAccessor } from '@loozo/radian/common';
import {
  provideRadianFocusableContext,
  RadianFocusable,
} from '@loozo/radian/roving-focus';
import { RadianToggle } from '@loozo/radian/toggle';
import { RadianToggleGroupContext } from './toggle-group-context';

@Directive({
  selector: '[radianToggleGroupItem]',
  providers: [
    provideRadianFocusableContext(() => {
      const toggleGroupItem = inject(RadianToggleGroupItem);

      return {
        value: toggleGroupItem.value,
      };
    }),
  ],
  hostDirectives: [
    {
      directive: RadianFocusable,
      inputs: ['disabled'],
    },
    {
      directive: RadianToggle,
      inputs: ['disabled'],
    },
  ],
  host: {
    '[attr.role]': 'context.multiple() ? null : "radio"',
    '[attr.aria-checked]': 'context.multiple() ? null : pressed()',
    '[attr.aria-pressed]': 'context.multiple() ? pressed() : null',
  },
})
export class RadianToggleGroupItem {
  /**
   * A string value for the toggle group item.
   * All items within a toggle group should use a unique value.
   * */
  value = input.required<string>();
  protected context = inject(RadianToggleGroupContext);

  /** Whether the item is pressed. */
  pressed = computed(() => this.context.isItemActive(this.value()));

  constructor() {
    const toggleControlValueAccessor = inject(RadianControlValueAccessor, {
      self: true,
    });

    effect(() => {
      if (toggleControlValueAccessor.value()) {
        untracked(() => this.context.itemActivated(this.value()));
      } else {
        untracked(() => this.context.itemDeactivated(this.value()));
      }
    });

    effect(() => {
      const isActive = this.pressed();

      untracked(() => toggleControlValueAccessor.setValue(isActive));
    });
  }
}
