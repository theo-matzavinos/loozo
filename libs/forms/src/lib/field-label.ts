import { Directive, inject } from '@angular/core';
import { LoozoAbstractField } from './abstract-field';

/** Component that renders a label for a field. */
@Directive({
  selector: '[loozoFieldLabel]',
  standalone: true,
  host: {
    '[id]': 'field.labelId()',
    '[htmlFor]': 'field.controlId()',
  },
})
export class LoozoFieldLabel {
  protected field = inject(LoozoAbstractField);
}
