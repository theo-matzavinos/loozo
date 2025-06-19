import {
  afterNextRender,
  booleanAttribute,
  DestroyRef,
  Directive,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { RadianDirection, Direction } from '@loozo/radian/common';
import { RadianPopper } from '@loozo/radian/popper';
import { RadianMenuContext, RadianRootMenuContext } from './menu-context';

@Directive({
  selector: '[radianMenu]',
  providers: [
    { provide: RadianMenuContext, useFactory: RadianMenu.contextFactory },
    {
      provide: RadianRootMenuContext,
      useFactory() {
        return (
          inject(RadianRootMenuContext, {
            optional: true,
            skipSelf: true,
            host: true,
          }) ?? inject(RadianMenuContext)
        );
      },
    },
  ],
  hostDirectives: [
    RadianPopper,
    {
      directive: RadianDirection,
      inputs: ['radianDirection:dir'],
    },
  ],
})
export class RadianMenu {
  open = input(false, { transform: booleanAttribute });
  dir = input<Direction>();
  modal = input(false, { transform: booleanAttribute });
  openChange = output<boolean>();

  private _isOpen = linkedSignal(this.open);
  isOpen = this._isOpen.asReadonly();

  setOpen(open: boolean) {
    this._isOpen.set(open);
    this.openChange.emit(open);
  }

  toggle() {
    this.setOpen(!this._isOpen());
  }

  private static contextFactory(): RadianMenuContext {
    const menu = inject(RadianMenu);
    const direction = inject(RadianDirection);
    const isUsingKeyboard = signal(false);

    // Capture phase ensures we set the boolean before any side effects execute
    // in response to the key or pointer event as they might depend on this value.
    const handleKeyDown = () => {
      isUsingKeyboard.set(true);
      document.addEventListener('pointerdown', handlePointer, {
        capture: true,
        once: true,
      });
      document.addEventListener('pointermove', handlePointer, {
        capture: true,
        once: true,
      });
    };
    const handlePointer = () => isUsingKeyboard.set(false);

    afterNextRender(() => {
      document.addEventListener('keydown', handleKeyDown, { capture: true });
    });

    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('pointerdown', handlePointer, {
        capture: true,
      });
      document.removeEventListener('pointermove', handlePointer, {
        capture: true,
      });
    });

    return {
      open: menu._isOpen.asReadonly(),
      dir: direction.value,
      modal: menu.modal,
      isUsingKeyboard: isUsingKeyboard.asReadonly(),
      content: signal<HTMLElement | undefined>(undefined),
      toggle() {
        menu.toggle();
      },
      close() {
        menu.setOpen(false);
      },
      setOpen(open: boolean) {
        menu.setOpen(open);
      },
    };
  }
}
