import { booleanAttribute, Directive, inject, input } from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianDirection } from '@loozo/radian/common';
import {
  provideRadianToggleGroupOptions,
  RadianToggleGroup,
} from '@loozo/radian/toggle-group';

@Directive({
  selector: '[radianToolbarGroup]',
  providers: [provideRadianToggleGroupOptions({ ronvigFocusDisabled: true })],
  hostDirectives: [
    {
      directive: RadianToggleGroup,
      inputs: ['multiple', 'loop', 'disabled', 'value'],
    },
  ],
  host: {
    '[attr.dir]': 'direction.value()',
  },
})
export class RadianToolbarToggleGroup {
  /** Determines whether a single or multiple items can be pressed at a time. */
  multiple = input(false, { transform: booleanAttribute });
  /** Whether keyboard navigation should loop around. */
  loop = input(true, { transform: booleanAttribute });
  /** When `true`, prevents the user from interacting with the toggle group and all its items. */
  disabled = input(false, { transform: booleanAttribute });
  /** Current value of this group. */
  value = input<string | string[]>();

  /** Emits when any of the buttons is toggled. */
  valueChange = outputFromObservable(
    outputToObservable(inject(RadianToggleGroup).valueChange),
  );

  protected direction = inject(RadianDirection);
}
