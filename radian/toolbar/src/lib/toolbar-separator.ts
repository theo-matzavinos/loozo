import { Directive, effect, inject, untracked } from '@angular/core';
import { RadianSeparator } from '@loozo/radian/separator';
import { RadianToolbar } from './toolbar';

@Directive({
  selector: '[radianToolbarSeparator]',
  hostDirectives: [RadianSeparator],
})
export class RadianToolbarSeparator {
  constructor() {
    const toolbar = inject(RadianToolbar);
    const separator = inject(RadianSeparator);

    effect(() => {
      const orientation = toolbar.orientation();

      untracked(() => separator.setOrientation(orientation));
    });
  }
}
