import { booleanAttribute, Directive, inject, input } from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianSubMenu } from '@loozo/radian/menu';

@Directive({
  selector: '[radianContextSubMenu]',
  hostDirectives: [{ directive: RadianSubMenu, inputs: ['open'] }],
})
export class RadianContextSubMenu {
  open = input(false, { transform: booleanAttribute });

  private subMenu = inject(RadianSubMenu);
  openChange = outputFromObservable(
    outputToObservable(this.subMenu.openChange),
  );
}
