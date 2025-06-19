import { Directive, effect, inject } from '@angular/core';
import { RadianPortal } from '@loozo/radian/portal';
import { RadianNavigationMenuContext } from './navigation-menu-context';

@Directive({
  selector: '[radianNavigationMenuViewportPortal]',
  hostDirectives: [RadianPortal],
})
export class RadianNavigationMenuViewportPortal {
  constructor() {
    const context = inject(RadianNavigationMenuContext);
    const portal = inject(RadianPortal);

    effect(() => {
      portal.setContainer(context.viewport());
    });
  }
}
