import { Directive, inject } from '@angular/core';
import { RadianSelectItemContext } from './select-item-context';

@Directive({
  selector: '[radianSelectItemText]',
  host: {
    '[id]': 'itemContext.textId',
  },
})
export class RadianSelectItemText {
  protected itemContext = inject(RadianSelectItemContext);
}
