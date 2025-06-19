import { booleanAttribute, Directive, inject, input } from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import {
  RadianControlValueAccessor,
  RadianDirection,
  Direction,
  RadianOrientation,
} from '@loozo/radian/common';
import {
  provideRadianRovingFocusGroupContext,
  RadianRovingFocusGroup,
} from '@loozo/radian/roving-focus';

@Directive({
  selector: '[radianRadioGroup]',
  exportAs: 'radianRadioGroup',
  providers: [
    provideRadianRovingFocusGroupContext(() => {
      const radioGroup = inject(RadianRadioGroup);
      const direction = inject(RadianDirection);

      return {
        dir: direction.value,
        orientation: radioGroup.orientation,
        loop: radioGroup.loop,
      };
    }),
  ],
  hostDirectives: [
    RadianRovingFocusGroup,
    {
      directive: RadianControlValueAccessor,
      inputs: ['value', 'disabled'],
    },
    { directive: RadianDirection, inputs: ['radianDirection:dir'] },
  ],
  host: {
    role: 'radiogroup',
    '[attr.aria-required]': 'required() || null',
    '[attr.aria-orientation]': 'orientation()',
    '[attr.data-disabled]': 'controlValueAccessor.disabled() || null',
    '[dir]': 'dir()',
  },
})
export class RadianRadioGroup {
  /** Whether this control is disabled. */
  disabled = input(false, {
    transform: booleanAttribute,
  });
  /** Whether the checkbox is required. For a11y purposes - does not perform validation. */
  required = input(false, { transform: booleanAttribute });
  /**
   * Name of the form control. Submitted with the form as part of a name/value pair.
   */
  name = input<string>();
  /**
   * The orientation of the group.
   * Mainly so arrow navigation is done accordingly (left & right vs. up & down)
   */
  orientation = input.required<RadianOrientation>();
  /**
   * The direction of navigation between items.
   */
  dir = input<Direction>();
  /**
   * Whether keyboard navigation should loop around.
   */
  loop = input(true, { transform: booleanAttribute });
  /**
   * The current value of the radio group.
   */
  value = input<string>();

  protected controlValueAccessor = inject(RadianControlValueAccessor);

  /** Emits when a radio button is toggled. */
  valueChange = outputFromObservable(
    outputToObservable(this.controlValueAccessor.valueChange),
  );
}
