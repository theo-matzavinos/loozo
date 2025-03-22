import {
  afterNextRender,
  booleanAttribute,
  DestroyRef,
  Directive,
  inject,
  InjectionToken,
  input,
  model,
  signal,
} from '@angular/core';
import { RadianDirection, RadianDirectionality } from '@loozo/radian/common';
import { RadianPopper } from '@loozo/radian/popper';

export type RadianMenuContext = ReturnType<
  (typeof RadianMenu)['contextFactory']
>;

export const RadianMenuContext = new InjectionToken<RadianMenuContext>(
  '[Radian] Menu Context',
);

@Directive({
  selector: '[radianMenu]',
  providers: [
    { provide: RadianMenuContext, useFactory: RadianMenu.contextFactory },
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
  open = model(false);
  dir = input<RadianDirectionality>(RadianDirectionality.LeftToRight);
  modal = input(false, { transform: booleanAttribute });

  private static contextFactory() {
    const menu = inject(RadianMenu);
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
      open: menu.open.asReadonly(),
      dir: menu.dir,
      modal: menu.modal,
      isUsingKeyboard: isUsingKeyboard.asReadonly(),
      toggle() {
        menu.open.update((v) => !v);
      },
      close() {
        menu.open.set(false);
      },
    };
  }
}
