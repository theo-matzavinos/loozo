import {
  booleanAttribute,
  computed,
  contentChild,
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { RadianContextMenuContext } from './context-menu-context';
import { Direction, uniqueId } from '@loozo/radian/common';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianContextMenuTrigger } from './context-menu-trigger';
import { RadianMenu } from '@loozo/radian/menu';

@Directive({
  selector: '[radianContextMenu]',
  exportAs: 'radianContextMenu',
  providers: [
    {
      provide: RadianContextMenuContext,
      useFactory: RadianContextMenu.contextFactory,
    },
  ],
  hostDirectives: [{ directive: RadianMenu, inputs: ['open', 'dir', 'modal'] }],
})
export class RadianContextMenu {
  id = input(uniqueId('radian-context-menu'));
  open = input(false, { transform: booleanAttribute });
  dir = input<Direction>(Direction.LeftToRight);
  modal = input(false, { transform: booleanAttribute });
  private menu = inject(RadianMenu);
  openChange = outputFromObservable(outputToObservable(this.menu.openChange));
  private trigger = contentChild.required(RadianContextMenuTrigger, {
    read: ElementRef,
  });

  private static contextFactory(): RadianContextMenuContext {
    const contextMenu = inject(RadianContextMenu);

    return {
      contentId: computed(() => `${contextMenu.id()}-content`),
      modal: contextMenu.modal,
      open: contextMenu.menu.open,
      setOpen(open) {
        contextMenu.menu.setOpen(open);
      },
      toggle() {
        contextMenu.menu.toggle();
      },
      triggerId: computed(() => `${contextMenu.id()}-trigger`),
      trigger: contextMenu.trigger,
    };
  }
}
