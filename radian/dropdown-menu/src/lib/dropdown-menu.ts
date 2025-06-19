import {
  booleanAttribute,
  computed,
  contentChild,
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { RadianDropdownMenuContext } from './dropdown-menu-context';
import { Direction, uniqueId } from '@loozo/radian/common';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianDropdownMenuTrigger } from './dropdown-menu-trigger';
import { RadianMenu } from '@loozo/radian/menu';

@Directive({
  selector: '[radianDropdownMenu]',
  exportAs: 'radianDropdownMenu',
  providers: [
    {
      provide: RadianDropdownMenuContext,
      useFactory: RadianDropdownMenu.contextFactory,
    },
  ],
  hostDirectives: [{ directive: RadianMenu, inputs: ['open', 'dir', 'modal'] }],
})
export class RadianDropdownMenu {
  id = input(uniqueId('radian-dropdown-menu'));
  open = input(false, { transform: booleanAttribute });
  dir = input<Direction>(Direction.LeftToRight);
  modal = input(false, { transform: booleanAttribute });
  private menu = inject(RadianMenu);
  openChange = outputFromObservable(outputToObservable(this.menu.openChange));
  private trigger = contentChild.required(RadianDropdownMenuTrigger, {
    read: ElementRef,
  });

  private static contextFactory(): RadianDropdownMenuContext {
    const dropdownMenu = inject(RadianDropdownMenu);

    return {
      contentId: computed(() => `${dropdownMenu.id()}-content`),
      modal: dropdownMenu.modal,
      open: dropdownMenu.menu.open,
      setOpen(open) {
        dropdownMenu.menu.setOpen(open);
      },
      toggle() {
        dropdownMenu.menu.toggle();
      },
      triggerId: computed(() => `${dropdownMenu.id()}-trigger`),
      trigger: dropdownMenu.trigger,
    };
  }
}
