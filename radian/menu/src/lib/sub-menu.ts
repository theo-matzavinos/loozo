import {
  booleanAttribute,
  Directive,
  effect,
  inject,
  input,
  OnDestroy,
  signal,
} from '@angular/core';
import { uniqueId } from '@loozo/radian/common';
import { RadianMenu } from './menu';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianMenuContext } from './menu-context';
import { RadianSubMenuContext } from './sub-menu-context';

@Directive({
  selector: '[radianSubMenu]',
  providers: [
    { provide: RadianSubMenuContext, useFactory: RadianSubMenu.contextFactory },
  ],
  hostDirectives: [{ directive: RadianMenu, inputs: ['open'] }],
})
export class RadianSubMenu implements OnDestroy {
  open = input(false, { transform: booleanAttribute });

  private menu = inject(RadianMenu);
  openChange = outputFromObservable(outputToObservable(this.menu.openChange));

  private parentMenuContext = inject(RadianMenuContext, { skipSelf: true });

  constructor() {
    // Prevent the parent menu from reopening with open submenus.
    effect(() => {
      if (this.parentMenuContext.open() === false) {
        this.menu.setOpen(false);
      }
    });
  }

  ngOnDestroy() {
    this.menu.setOpen(false);
  }

  private static contextFactory(): RadianSubMenuContext {
    const id = uniqueId('radian-sub-menu');
    return {
      contentId: `${id}-content`,
      triggerId: `${id}-trigger`,
      trigger: signal<HTMLButtonElement | undefined>(undefined),
    };
  }
}
