import { booleanAttribute, Directive, inject, input } from '@angular/core';
import {
  RadianDirection,
  Direction,
  RadianOrientation,
  uniqueId,
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
        valueFactory() {
          return uniqueId('radian-toolbar-item');
        },
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
  dir = input<Direction>(Direction.LeftToRight);
  /** Whether keyboard navigation should loop around */
  loop = input(true, { transform: booleanAttribute });
}
