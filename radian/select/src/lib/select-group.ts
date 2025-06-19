import { Directive, inject } from '@angular/core';
import { uniqueId } from '@loozo/radian/common';
import { RadianSelectGroupContext } from './select-group-context';

@Directive({
  selector: '[radianSelectGroup]',
  providers: [
    {
      provide: RadianSelectGroupContext,
      useFactory: RadianSelectGroup.contextFactory,
    },
  ],
  host: {
    role: 'group',
    '[attr.aria-labelledby]': 'labelId',
  },
})
export class RadianSelectGroup {
  protected labelId = uniqueId('radian-select-label');

  private static contextFactory(): RadianSelectGroupContext {
    const group = inject(RadianSelectGroup);

    return {
      labelId: group.labelId,
    };
  }
}
