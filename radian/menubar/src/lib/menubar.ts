import {
  booleanAttribute,
  computed,
  contentChildren,
  Directive,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { RadianMenubarContext } from './menubar-context';
import { Direction, RadianDirection } from '@loozo/radian/common';
import {
  RadianRovingFocusGroup,
  provideRadianRovingFocusGroupContext,
} from '@loozo/radian/roving-focus';
import { RadianMenubarTrigger } from './menubar-trigger';

@Directive({
  selector: '[radianMenubar]',
  providers: [
    { provide: RadianMenubarContext, useFactory: RadianMenubar.contextFactory },
    provideRadianRovingFocusGroupContext(() => {
      const menubar = inject(RadianMenubar);
      const direction = inject(RadianDirection);

      return () => ({
        dir: direction.value,
        orientation: computed(() => 'horizontal'),
        loop: menubar.loop,
      });
    }),
  ],
  hostDirectives: [
    RadianRovingFocusGroup,
    { directive: RadianDirection, inputs: ['radianDirection:dir'] },
  ],
  host: {
    role: 'menubar',
  },
})
export class RadianMenubar {
  value = input<string>('');
  loop = input(true, { transform: booleanAttribute });
  dir = input<Direction>();
  valueChange = output<string>();

  private _currentValue = linkedSignal(this.value);

  currentValue = this._currentValue.asReadonly();

  private triggers = contentChildren(RadianMenubarTrigger, {
    read: ElementRef,
    descendants: true,
  });

  private static contextFactory(): RadianMenubarContext {
    const menubar = inject(RadianMenubar);
    const direction = inject(RadianDirection);
    const rovingFocusGroup = inject(RadianRovingFocusGroup);

    return {
      dir: direction.value,
      loop: menubar.loop,
      value: menubar.currentValue,
      triggers: menubar.triggers,
      closeMenu() {
        menubar._currentValue.set('');
        menubar.valueChange.emit('');
      },
      openMenu(value) {
        menubar._currentValue.set(value);
        menubar.valueChange.emit(value);
        // We need to manage tab stop id manually as `RovingFocusGroup` updates the stop
        // based on focus, and in some situations our triggers won't ever be given focus
        // (e.g. click to open and then outside to close)
        rovingFocusGroup.setActive(value);
      },
      toggleMenu(value) {
        menubar._currentValue.update((v) => (v ? '' : value));
        menubar.valueChange.emit(value);
        // `menuOpened` and `menuClosed` are called exclusively so we
        // need to update the id in either case.
        rovingFocusGroup.setActive(value);
      },
    };
  }
}
