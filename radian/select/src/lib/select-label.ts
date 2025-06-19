import { Directive, inject } from '@angular/core';
import { RadianSelectGroupContext } from './select-group-context';

@Directive({
  selector: '[radianSelectLabel]',
  host: {
    '[id]': 'groupContext.labelId',
  },
})
export class RadianSelectLabel {
  protected groupContext = inject(RadianSelectGroupContext);
}
