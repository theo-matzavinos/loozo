import { Directive, inject } from '@angular/core';
import { LoozoAbstractField } from './abstract-field';

@Directive({
  selector: 'label[loozoFieldLabel]',
  standalone: true,
  host: {
    '[htmlFor]': 'field.id()',
  },
})
export class LoozoFieldLabel {
  protected field = inject(LoozoAbstractField);
}
