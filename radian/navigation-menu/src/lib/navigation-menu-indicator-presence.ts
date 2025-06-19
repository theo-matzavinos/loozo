import { computed, Directive, inject } from '@angular/core';
import { RadianNavigationMenuContext } from './navigation-menu-context';
import { provideRadianPresenceContext } from '@loozo/radian/common';

@Directive({
  selector: '[radianNavigationMenuIndicatorPresence]',
  providers: [
    provideRadianPresenceContext(() => {
      const context = inject(RadianNavigationMenuContext);

      return {
        present: computed(() => !!context.value()),
      };
    }),
  ],
})
export class RadianNavigationMenuIndicatorPresence {}
