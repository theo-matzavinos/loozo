import { Directive, inject } from '@angular/core';
import { RadianTabsGroupContext } from './tabs-group';
import {
  provideRadianRovingFocusGroupContext,
  RadianRovingFocusGroup,
} from '@loozo/radian/roving-focus';

@Directive({
  selector: '[radianTabsTriggersList]',
  standalone: true,
  providers: [
    provideRadianRovingFocusGroupContext(() => {
      const context = inject(RadianTabsGroupContext);

      return {
        orientation: context.orientation,
        dir: context.dir,
        loop: context.loop,
      };
    }),
  ],
  hostDirectives: [
    {
      directive: RadianRovingFocusGroup,
    },
  ],
  host: {
    role: 'tablist',
    '[attr.aria-orientation]': 'context.orientation()',
  },
})
export class RadianTabsTriggersList {
  protected context = inject(RadianTabsGroupContext);
}
