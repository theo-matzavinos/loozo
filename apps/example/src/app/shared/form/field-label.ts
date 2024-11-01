import { Directive } from '@angular/core';
import { Label } from '../label';
import { LoozoFieldLabel } from '@loozo/forms';

/** Component that renders a label for a field. */
@Directive({
  selector: 'label[appFieldLabel]',
  standalone: true,
  hostDirectives: [
    LoozoFieldLabel,
    {
      directive: Label,
      inputs: ['class'],
    },
  ],
})
export class FieldLabel {}
