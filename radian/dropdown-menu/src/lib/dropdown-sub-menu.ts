import { booleanAttribute, Directive, inject, input } from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianSubMenu } from '@loozo/radian/menu';

@Directive({
  selector: '[radianDropdownSubMenu]',
  hostDirectives: [{ directive: RadianSubMenu, inputs: ['open'] }],
})
export class RadianDropdownSubMenu {
  open = input(false, { transform: booleanAttribute });

  private subMenu = inject(RadianSubMenu);
  openChange = outputFromObservable(
    outputToObservable(this.subMenu.openChange),
  );
}
