import { computed, Directive, inject } from '@angular/core';
import { RadianDialogContext } from './dialog-context';
import {
  provideRadianRemoveScrollContext,
  RadianRemoveScroll,
  RadianRemoveScrollbar,
} from '@loozo/radian/remove-scroll';

@Directive({
  selector: '[radianDialogOverlay]',
  providers: [
    provideRadianRemoveScrollContext(() => {
      const context = inject(RadianDialogContext);

      return {
        enabled: computed(() => true),
        allowPinchZoom: true,
        shards: computed(() => [context.content()]),
      };
    }),
  ],
  hostDirectives: [RadianRemoveScrollbar, RadianRemoveScroll],
  host: {
    '[attr.data-state]': 'context.state()',
    '[style]': `{
      pointerEvents: 'auto'
    }`,
  },
})
export class RadianDialogOverlay {
  protected context = inject(RadianDialogContext);
}
