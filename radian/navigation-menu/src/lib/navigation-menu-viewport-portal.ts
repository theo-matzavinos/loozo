import { Directive, effect, inject, isDevMode } from '@angular/core';
import { RadianPortal } from '@loozo/radian/portal';
import { RadianNavigationMenuContext } from './navigation-menu';

@Directive({
  selector: '[radianNavigationMenuViewportPortal]',
  hostDirectives: [RadianPortal],
})
export class RadianNavigationMenuViewportPortal {
  constructor() {
    const context = inject(RadianNavigationMenuContext);
    const portal = inject(RadianPortal);

    effect(() => {
      if (isDevMode() && !context.viewport()) {
        console.error('No viewport element found!');

        return;
      }

      portal.setContainer(context.viewport()!);
    });
  }
}
