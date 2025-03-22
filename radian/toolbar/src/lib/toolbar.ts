import { booleanAttribute, Directive, inject, input } from '@angular/core';
import {
  RadianDirection,
  RadianDirectionality,
  RadianOrientation,
} from '@loozo/radian/common';
import { provideRadianRovingFocusGroupContext } from '@loozo/radian/roving-focus';

@Directive({
  selector: '[radianToolbar]',
  providers: [
    provideRadianRovingFocusGroupContext(() => {
      const toolbar = inject(RadianToolbar);
      const direction = inject(RadianDirection);

      return {
        dir: direction.value,
        orientation: toolbar.orientation,
        loop: toolbar.loop,
      };
    }),
  ],
  host: {
    role: 'toolbar',
    '[attr.aria-orientation]': 'orientation()',
  },
})
export class RadianToolbar {
  /**
   * The orientation of the group.
   * Mainly so arrow navigation is done accordingly (left & right vs. up & down)
   */
  orientation = input<RadianOrientation>(RadianOrientation.Horizontal);
  /** The direction of navigation between items. */
  dir = input<RadianDirectionality>(RadianDirectionality.LeftToRight);
  /** Whether keyboard navigation should loop around */
  loop = input(true, { transform: booleanAttribute });
}
