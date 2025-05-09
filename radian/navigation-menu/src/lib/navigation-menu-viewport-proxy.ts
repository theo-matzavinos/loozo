import { Directive, inject } from '@angular/core';
import { RadianNavigationMenuItemContext } from './navigation-menu-item';

@Directive({
  selector: '[radianNavigationMenuViewportProxy]',
  host: {
    '[attr.aria-owns]': 'itemContext.contentId()',
  },
})
export class RadianNavigationMenuViewportProxy {
  protected itemContext = inject(RadianNavigationMenuItemContext);
}
