import { computed, Directive, inject } from '@angular/core';
import { RadianNavigationMenuContext } from './navigation-menu-context';
import { provideRadianPresenceContext } from '@loozo/radian/common';
import { RadianNavigationMenuItemContext } from './navigation-menu-item-context';

@Directive({
  selector: '[radianNavigationMenuContentPresence]',
  providers: [
    provideRadianPresenceContext(() => {
      const context = inject(RadianNavigationMenuContext);
      const itemContext = inject(RadianNavigationMenuItemContext);

      return {
        present: computed(() => context.value() === itemContext.value()),
      };
    }),
  ],
})
export class RadianNavigationMenuContentPresence {}
