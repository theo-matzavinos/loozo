import {
  computed,
  contentChild,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  untracked,
} from '@angular/core';
import { RadianMenubarMenuContext } from './menubar-menu-context';
import { uniqueId } from '@loozo/radian/common';
import { RadianMenubarContext } from './menubar-context';
import { RadianMenu } from '@loozo/radian/menu';
import { RadianMenubarTrigger } from './menubar-trigger';

@Directive({
  selector: '[radianMenubarMenu]',
  providers: [
    {
      provide: RadianMenubarMenuContext,
      useFactory: RadianMenubarMenu.contextFactory,
    },
  ],
  hostDirectives: [RadianMenu],
})
export class RadianMenubarMenu {
  value = input(uniqueId('radian-menu'));

  private context = inject(RadianMenubarContext);

  open = computed(() => this.context.value() === this.value());

  protected trigger = contentChild.required(RadianMenubarTrigger, {
    read: ElementRef,
  });
  constructor() {
    const menu = inject(RadianMenu);

    effect(() => {
      const open = this.open();

      menu.setOpen(open);
    });

    menu.openChange.subscribe((open) => {
      // Menu only calls `onOpenChange` when dismissing so we
      // want to close our MenuBar based on the same events.
      if (!open) {
        this.context.closeMenu();
      }
    });
  }

  private static contextFactory(): RadianMenubarMenuContext {
    const menubarMenu = inject(RadianMenubarMenu);

    return {
      open: menubarMenu.open,
      contentId: computed(() => `${menubarMenu.value()}-content`),
      trigger: menubarMenu.trigger,
      triggerId: computed(() => `${menubarMenu.value()}-trigger`),
      value: menubarMenu.value,
      wasKeyboardTriggerOpen: linkedSignal({
        source: menubarMenu.open,
        computation: (open, previous) => (open ? !!previous?.value : false),
      }),
    };
  }
}
