import { Directive } from '@angular/core';
import { provideRadianFocusGroup } from './focus-group';

@Directive({
  selector: '[radianNavigationMenuList]',
  providers: [provideRadianFocusGroup()],
})
export class RadianNavigationMenuList {}
